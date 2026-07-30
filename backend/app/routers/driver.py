# pyright: reportUnboundVariable=false
# pyright: reportPossiblyUnboundVariable=false
import datetime
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

from app.auth.dependencies import get_current_active_user, get_platform_db, get_tenant_db
from app.models import Buyer, DeliveryBill, DeliveryItem, Item, Organization, User
from app.models.enums import UserRole
from app.models.sequence import TenantSequence
from app.schemas.buyer import BuyerOut
from app.schemas.delivery import DebtCollectionCreate, DeliveryBillCreate, DeliveryBillOut
from app.schemas.item import ItemOut
from app.schemas.organization import OrganizationOut


async def generate_bill_number(db: AsyncSession, target_date: datetime.datetime, prefix: str = "SHA") -> str:
    # Format: prefix_YYYY
    year = target_date.strftime("%Y")
    seq_name = f"bill_{prefix.lower()}_{year}"
    
    seq = await db.scalar(select(TenantSequence).where(TenantSequence.name == seq_name).with_for_update())
    if not seq:
        seq = TenantSequence(name=seq_name, last_value=0)
        db.add(seq)
        
    seq.last_value += 1
    # 8-digit padding: PREFIX-YYYY-00000000
    return f"{prefix}-{year}-{seq.last_value:08d}"

router = APIRouter(tags=["Driver"])

@router.post("/entries", response_model=DeliveryBillOut)
async def create_delivery_entry(
    bill_in: DeliveryBillCreate,
    x_idempotency_key: Annotated[str, Header(min_length=1)],
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_tenant_db),
    platform_db: AsyncSession = Depends(get_platform_db),
):
    try:
        async with db.begin_nested() if db.in_transaction() else db.begin():
            from sqlalchemy import text
            await db.execute(text("SET LOCAL lock_timeout = '3s';"))
            
            buyer = None
            if bill_in.buyer_id:
                buyer = await db.scalar(
                    select(Buyer)
                    .options(selectinload(Buyer.inventory))
                    .where(Buyer.id == bill_in.buyer_id)
                    .with_for_update()
                )
                if not buyer:
                    raise HTTPException(status_code=404, detail="Buyer not found")

            # Determine timestamp and generate bill number
            bill_timestamp = bill_in.timestamp if bill_in.timestamp else datetime.datetime.now(datetime.UTC)
            # Ensure timestamp has timezone info
            if bill_timestamp.tzinfo is None:
                bill_timestamp = bill_timestamp.replace(tzinfo=datetime.UTC)
                
            org = await platform_db.get(Organization, current_user.organization_id)
            sales_prefix = org.bill_prefix_sales if org else "SHA"
            new_bill_number = await generate_bill_number(db, bill_timestamp, prefix=sales_prefix)

            # Create the Bill parent
            bill = DeliveryBill(
                driver_id=current_user.id,
                buyer_id=bill_in.buyer_id,
                adhoc_buyer_name=bill_in.adhoc_buyer_name,
                bill_number=new_bill_number,
                total_bill_amount=0.0,
                cash_collected=bill_in.cash_collected,
                upi_collected=bill_in.upi_collected,
                timestamp=bill_timestamp,
                idempotency_key=x_idempotency_key,
                opening_balance=float(buyer.balance_pending) if buyer else 0.0,
                closing_balance=0.0,
            )
            db.add(bill)
            
            total_bill = 0.0
            total_full_delivered = 0
            total_empty_received = 0
            
            # Sort items by item_id to prevent deadlocks when locking multiple items
            sorted_items = sorted(bill_in.items, key=lambda x: str(x.item_id))
            
            for item_in in sorted_items:
                item = await db.scalar(select(Item).where(Item.id == item_in.item_id).with_for_update())
                if not item:
                    raise HTTPException(status_code=404, detail=f"Item {item_in.item_id} not found")
                    
                # Snapshot pricing
                unit_price = float(item.price)
                if buyer and buyer.price_per_kg is not None and item.capacity_kg is not None:
                    unit_price = float(buyer.price_per_kg) * float(item.capacity_kg)
                    
                line_total = unit_price * item_in.full_delivered
                total_bill += line_total
                
                # Create Entry item
                entry = DeliveryItem(
                    bill=bill,
                    item_id=item.id,
                    unit_price_at_delivery=unit_price,
                    line_total_amount=line_total,
                    full_delivered=item_in.full_delivered,
                    empty_received=item_in.empty_received,
                    buyer_holding_snapshot=0,
                )
                db.add(entry)
                
                # Update Item Inventory (Running Totals)
                item.current_full -= item_in.full_delivered
                item.current_empty += item_in.empty_received
                if item.current_full < 0:
                    raise HTTPException(status_code=400, detail=f"Not enough full cylinders in warehouse for item {item.name}")
                
                # Update Buyer Inventory
                if buyer:
                    from app.models.buyer import BuyerInventory
                    buyer_inv = next((inv for inv in buyer.inventory if inv.item_id == item.id), None)
                    if not buyer_inv:
                        buyer_inv = BuyerInventory(item_id=item.id, cylinders_pending=0)
                        buyer.inventory.append(buyer_inv)
                    buyer_inv.cylinders_pending += item_in.full_delivered
                    buyer_inv.cylinders_pending -= item_in.empty_received
                    if buyer_inv.cylinders_pending < 0:
                        raise HTTPException(status_code=400, detail=f"Buyer cannot return more empty cylinders than they currently hold for item {item.name}")
                    
                    entry.buyer_holding_snapshot = buyer_inv.cylinders_pending
                
                total_full_delivered += item_in.full_delivered
                total_empty_received += item_in.empty_received
            
            bill.total_bill_amount = total_bill
            
            if bill_in.cash_collected + bill_in.upi_collected > total_bill:
                raise HTTPException(status_code=409, detail="Payment cannot exceed total bill amount")
            
            # Update Buyer Balances
            if buyer:
                buyer.balance_pending = float(buyer.balance_pending) + total_bill
                buyer.balance_pending = float(buyer.balance_pending) - (bill_in.cash_collected + bill_in.upi_collected)
                buyer.total_lifetime_sales = float(buyer.total_lifetime_sales) + total_bill
                buyer.total_lifetime_paid = float(buyer.total_lifetime_paid) + (bill_in.cash_collected + bill_in.upi_collected)
                bill.closing_balance = float(buyer.balance_pending)
                bill.closing_cylinders = sum(inv.cylinders_pending for inv in buyer.inventory)
            else:
                bill.closing_balance = 0.0
                bill.closing_cylinders = 0
                
            await db.flush()
            bill_id = bill.id
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if "idempotency_key" in str(e.orig):
            existing_bill = await db.scalar(
                select(DeliveryBill)
                .options(joinedload(DeliveryBill.buyer).selectinload(Buyer.inventory), selectinload(DeliveryBill.items).joinedload(DeliveryItem.item))
                .where(DeliveryBill.idempotency_key == x_idempotency_key)
            )
            if existing_bill:
                return existing_bill
        raise e
    
    # Eagerly load the buyer and items for response
    final_bill = await db.scalar(
        select(DeliveryBill)
        .options(joinedload(DeliveryBill.buyer).selectinload(Buyer.inventory), selectinload(DeliveryBill.items).joinedload(DeliveryItem.item))
        .where(DeliveryBill.id == bill_id)
    )
    return final_bill


@router.get("/entries")
async def list_delivery_entries(
    paginated: bool = False,
    cursor: uuid.UUID | None = None,
    limit: int = Query(20, ge=1, le=100),
    bill_type: str | None = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    query = select(DeliveryBill).options(
        joinedload(DeliveryBill.buyer).selectinload(Buyer.inventory),
        selectinload(DeliveryBill.items).joinedload(DeliveryItem.item)
    )
    
    if current_user.role == UserRole.DRIVER:
        query = query.filter(DeliveryBill.driver_id == current_user.id)
    
    import zoneinfo
    from datetime import datetime
    ist_tz = zoneinfo.ZoneInfo('Asia/Kolkata')
    now_ist = datetime.now(ist_tz)
    today = datetime(now_ist.year, now_ist.month, now_ist.day, tzinfo=ist_tz)
    query = query.filter(DeliveryBill.timestamp >= today)
    
    if bill_type == "sales":
        query = query.filter(DeliveryBill.items.any())
    elif bill_type == "collections":
        query = query.filter(~DeliveryBill.items.any())

    if paginated:
        if cursor:
            query = query.filter(DeliveryBill.id < cursor)
        query = query.order_by(DeliveryBill.id.desc()).limit(limit)
        result = await db.scalars(query)
        items = result.unique().all()
        next_cursor = items[-1].id if len(items) == limit else None
        return {"items": items, "next_cursor": next_cursor}
    else:
        query = query.order_by(DeliveryBill.id.desc()).limit(100)
        result = await db.scalars(query)
        return result.unique().all()


@router.get("/items", response_model=list[ItemOut])
async def list_active_items(
    db: AsyncSession = Depends(get_tenant_db),
):
    # Driver can only see active items
    result = await db.scalars(select(Item).where(Item.is_active))
    return result.all()


@router.get("/buyers", response_model=list[BuyerOut])
async def list_active_buyers(
    db: AsyncSession = Depends(get_tenant_db),
):
    # Driver can only see active buyers
    result = await db.scalars(
        select(Buyer)
        .options(selectinload(Buyer.inventory))
        .where(Buyer.is_active)
    )
    return result.unique().all()


@router.post("/collections", response_model=DeliveryBillOut)
async def create_debt_collection(
    collection_in: DebtCollectionCreate,
    x_idempotency_key: Annotated[str, Header(min_length=1)],
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_tenant_db),
    platform_db: AsyncSession = Depends(get_platform_db),
):
    if collection_in.cash_collected + collection_in.upi_collected <= 0:
        raise HTTPException(status_code=400, detail="Collection amount must be greater than zero.")

    try:
        async with db.begin_nested() if db.in_transaction() else db.begin():
            from sqlalchemy import text
            await db.execute(text("SET LOCAL lock_timeout = '3s';"))
            
            buyer = await db.scalar(
                select(Buyer)
                .options(selectinload(Buyer.inventory))
                .where(Buyer.id == collection_in.buyer_id)
                .with_for_update()
            )
            if not buyer:
                raise HTTPException(status_code=404, detail="Buyer not found")

            total_paid = collection_in.cash_collected + collection_in.upi_collected
            if total_paid > float(buyer.balance_pending):
                raise HTTPException(status_code=409, detail="Collection amount exceeds the buyer's pending balance.")

            import datetime
            bill_timestamp = collection_in.timestamp if collection_in.timestamp else datetime.datetime.now(datetime.UTC)
            if bill_timestamp.tzinfo is None:
                bill_timestamp = bill_timestamp.replace(tzinfo=datetime.UTC)
                
            org = await platform_db.get(Organization, current_user.organization_id)
            coll_prefix = org.bill_prefix_collection if org else "REC"
            new_bill_number = await generate_bill_number(db, bill_timestamp, prefix=coll_prefix)

            opening_balance = float(buyer.balance_pending)
            closing_balance = opening_balance - total_paid

            bill = DeliveryBill(
                driver_id=current_user.id,
                buyer_id=collection_in.buyer_id,
                adhoc_buyer_name=None,
                bill_number=new_bill_number,
                total_bill_amount=0.0,
                cash_collected=collection_in.cash_collected,
                upi_collected=collection_in.upi_collected,
                timestamp=bill_timestamp,
                idempotency_key=x_idempotency_key,
                opening_balance=opening_balance,
                closing_balance=closing_balance,
            )
            db.add(bill)
            
            buyer.balance_pending = float(buyer.balance_pending) - total_paid
            buyer.total_lifetime_paid = float(buyer.total_lifetime_paid) + total_paid
            
            await db.flush()
            bill_id = bill.id
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if "idempotency_key" in str(e.orig):
            existing_bill = await db.scalar(
                select(DeliveryBill)
                .options(joinedload(DeliveryBill.buyer).selectinload(Buyer.inventory), selectinload(DeliveryBill.items).joinedload(DeliveryItem.item))
                .where(DeliveryBill.idempotency_key == x_idempotency_key)
            )
            if existing_bill:
                return existing_bill
        raise e

    final_bill = await db.scalar(
        select(DeliveryBill)
        .options(joinedload(DeliveryBill.buyer).selectinload(Buyer.inventory), selectinload(DeliveryBill.items).joinedload(DeliveryItem.item))
        .where(DeliveryBill.id == bill_id)
    )
    return final_bill


@router.get("/entries/{bill_id}/pdf")
async def generate_delivery_pdf_endpoint(
    bill_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: User = Depends(get_current_active_user)
):
    from fastapi.responses import StreamingResponse

    from app.services.reports.delivery_pdf import (
        DeliveryPdfData,
        DeliveryPdfItemData,
        generate_delivery_pdf,
    )
    
    bill = await db.scalar(
        select(DeliveryBill)
        .options(
            joinedload(DeliveryBill.buyer), 
            selectinload(DeliveryBill.items).joinedload(DeliveryItem.item)
        )
        .where(DeliveryBill.id == bill_id)
    )
    
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
        
    buyer_name = bill.buyer.name if bill.buyer else (bill.adhoc_buyer_name or "Cash Sale")
    buyer_address = bill.buyer.address if bill.buyer and bill.buyer.address else "-"
    buyer_phone = bill.buyer.phone if bill.buyer and bill.buyer.phone else "-"
    
    date_display_text = bill.timestamp.strftime("%d-%m-%Y %I:%M %p")
    bill_no = bill.bill_number or str(bill.id)
    
    pdf_items = []
    for entry in bill.items:
        pdf_items.append(DeliveryPdfItemData(
            item_name=entry.item.name,
            full_qty=entry.full_delivered,
            empty_qty=entry.empty_received,
            rate=float(entry.unit_price_at_delivery),
            amount=float(entry.line_total_amount)
        ))
        
    # 1a. Fetch organization
    from app.models.organization import Organization
    org = await db.get(Organization, current_user.organization_id)
    
    data = DeliveryPdfData(
        org_name=org.name if org else "Unknown Organization",
        org_address=org.address if org and org.address else "-",
        org_phone=org.phone if org and org.phone else "-",
        buyer_name=buyer_name,
        buyer_address=buyer_address,
        buyer_phone=buyer_phone,
        date_display_text=date_display_text,
        bill_no=bill_no,
        items=pdf_items,
        total_bill_amount=float(bill.total_bill_amount),
        cash_collected=float(bill.cash_collected),
        upi_collected=float(bill.upi_collected),
        opening_balance=float(bill.opening_balance),
        closing_balance=float(bill.closing_balance)
    )
    
    pdf_buffer = generate_delivery_pdf(data)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Bill_{bill_no}.pdf"}
    )


@router.get("/organization", response_model=OrganizationOut)
async def get_driver_organization(
    current_user: User = Depends(get_current_active_user),
    platform_db: AsyncSession = Depends(get_platform_db),
):
    org = await platform_db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org

