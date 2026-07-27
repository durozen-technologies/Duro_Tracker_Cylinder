import datetime
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_platform_db, get_tenant_db, require_tenant_admin
from app.core.security import get_password_hash
from app.models import (
    Buyer,
    DeliveryBill,
    DeliveryItem,
    Item,
    Organization,
    Provider,
    PurchaseBill,
    PurchaseEntry,
    User,
)
from app.models.enums import UserRole
from app.schemas.buyer import BuyerCreate, BuyerOut, BuyerUpdate
from app.schemas.item import ItemCreate, ItemOut, ItemUpdate
from app.schemas.organization import OrganizationOut
from app.schemas.user import UserCreate, UserOut, UserUpdate


class GlobalBillOut(BaseModel):
    id: uuid.UUID
    bill_number: str | None = None
    time: str
    buyer: str
    fullGiven: int
    emptyCollected: int
    total: float

class LedgerEntryOut(BaseModel):
    id: uuid.UUID
    date: str
    type: str
    bill_number: str | None = None
    fullGiven: int
    emptyCollected: int
    amount: float
    paid: float
    finRunBal: float
    cylRunBal: int

router = APIRouter(dependencies=[Depends(require_tenant_admin())])

@router.get("/organization", response_model=OrganizationOut)
async def get_my_organization(
    current_user: User = Depends(require_tenant_admin()),
    db: AsyncSession = Depends(get_platform_db),
):
    org = await db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org

@router.post("/items", response_model=ItemOut)
async def create_item(
    item_in: ItemCreate,
    db: AsyncSession = Depends(get_tenant_db),
):
    item = Item(
        name=item_in.name,
        price=item_in.price,
        capacity_kg=item_in.capacity_kg,
        initial_full=item_in.initial_full,
        initial_empty=item_in.initial_empty,
        current_full=item_in.initial_full,
        current_empty=item_in.initial_empty,
        hsn_code=item_in.hsn_code,
        gst_percent=item_in.gst_percent,
        is_active=item_in.is_active,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/items", response_model=list[ItemOut])
async def list_items(
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await db.scalars(select(Item))
    return result.all()


@router.put("/items/{item_id}", response_model=ItemOut)
async def update_item(
    item_id: uuid.UUID,
    item_in: ItemUpdate,
    db: AsyncSession = Depends(get_tenant_db),
):
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if item_in.name is not None:
        item.name = item_in.name
    if item_in.price is not None:
        item.price = item_in.price
    if item_in.capacity_kg is not None:
        item.capacity_kg = item_in.capacity_kg
    if item_in.current_full is not None:
        item.current_full = item_in.current_full
    if item_in.current_empty is not None:
        item.current_empty = item_in.current_empty
    if item_in.hsn_code is not None:
        item.hsn_code = item_in.hsn_code
    if item_in.gst_percent is not None:
        item.gst_percent = item_in.gst_percent
    if item_in.is_active is not None:
        item.is_active = item_in.is_active

    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db),
):
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete item because it has associated ledger history. Please deactivate it instead."
        )


# --- BUYERS ---
@router.post("/buyers", response_model=BuyerOut)
async def create_buyer(
    buyer_in: BuyerCreate,
    db: AsyncSession = Depends(get_tenant_db),
):
    from app.models.buyer import BuyerInventory
    buyer = Buyer(
        name=buyer_in.name,
        phone=buyer_in.phone,
        type=buyer_in.type,
        address=buyer_in.address,
        price_per_kg=buyer_in.price_per_kg,
        balance_pending=buyer_in.balance_pending,
    )
    if buyer_in.inventory:
        buyer.inventory = [
            BuyerInventory(item_id=inv.item_id, cylinders_pending=inv.cylinders_pending)
            for inv in buyer_in.inventory
        ]
    db.add(buyer)
    await db.commit()
    await db.refresh(buyer, ['inventory'])
    return buyer


@router.get("/buyers", response_model=list[BuyerOut])
async def list_buyers(
    db: AsyncSession = Depends(get_tenant_db),
):
    from sqlalchemy.orm import selectinload
    result = await db.scalars(select(Buyer).options(selectinload(Buyer.inventory)))
    return result.all()


@router.get("/buyers/bills", response_model=list[GlobalBillOut])
async def get_global_bills(
    db: AsyncSession = Depends(get_tenant_db),
):
    
    import zoneinfo
    from datetime import datetime
    ist_tz = zoneinfo.ZoneInfo('Asia/Kolkata')
    now_ist = datetime.now(ist_tz)
    today = datetime(now_ist.year, now_ist.month, now_ist.day, tzinfo=ist_tz)

    query = (
        select(
            DeliveryBill.id,
            DeliveryBill.bill_number,
            DeliveryBill.timestamp,
            DeliveryBill.total_bill_amount,
            DeliveryBill.adhoc_buyer_name,
            Buyer.name.label("buyer_name"),
            func.coalesce(func.sum(DeliveryItem.full_delivered), 0).label("total_full"),
            func.coalesce(func.sum(DeliveryItem.empty_received), 0).label("total_empty")
        )
        .outerjoin(Buyer, DeliveryBill.buyer_id == Buyer.id)
        .outerjoin(DeliveryItem, DeliveryBill.id == DeliveryItem.delivery_bill_id)
        .where(DeliveryBill.total_bill_amount > 0)
        .where(DeliveryBill.timestamp >= today)
        .group_by(
            DeliveryBill.id,
            DeliveryBill.bill_number,
            DeliveryBill.timestamp,
            DeliveryBill.total_bill_amount,
            DeliveryBill.adhoc_buyer_name,
            Buyer.name
        )
        .order_by(DeliveryBill.timestamp.desc())
        .limit(200) # Increased limit slightly since we are filtering by today
    )
    
    result = await db.execute(query)
    entries = result.all()
    
    bills = []
    for row in entries:
        buyer_name = row.buyer_name if row.buyer_name else row.adhoc_buyer_name or "Unknown"
        bills.append(
            GlobalBillOut(
                id=row.id,
                bill_number=row.bill_number,
                time=row.timestamp.isoformat(),
                buyer=buyer_name,
                fullGiven=row.total_full,
                emptyCollected=row.total_empty,
                total=float(row.total_bill_amount)
            )
        )
    return bills


class PaginatedLedgerOut(BaseModel):
    items: list[LedgerEntryOut]
    next_cursor: uuid.UUID | None

@router.get("/buyers/{buyer_id}/ledger", response_model=PaginatedLedgerOut)
async def get_buyer_ledger(
    buyer_id: uuid.UUID,
    cursor: uuid.UUID | None = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_tenant_db),
):
    from sqlalchemy.orm import selectinload

    from app.models import Buyer
    
    # Get the buyer to know the *current* actual balances
    buyer = await db.get(Buyer, buyer_id, options=[selectinload(Buyer.inventory)])
    if not buyer:
        return {"items": [], "next_cursor": None}

    # Get the entries for the buyer in reverse chronological order
    query = (
        select(DeliveryBill)
        .options(selectinload(DeliveryBill.items))
        .where(DeliveryBill.buyer_id == buyer_id)
    )

    if cursor:
        query = query.where(DeliveryBill.id < cursor)
        
    query = query.order_by(DeliveryBill.id.desc()).limit(limit)
    
    result = await db.scalars(query)
    entries = result.unique().all()
    
    ledger = []
    
    for e in entries:
        paid = float(e.cash_collected + e.upi_collected)
        bill_amt = float(e.total_bill_amount)
        
        total_full = sum(i.full_delivered for i in e.items)
        total_empty = sum(i.empty_received for i in e.items)
        
        etype = 'bill' if total_full > 0 else 'payment'
        
        ledger.append(
            LedgerEntryOut(
                id=e.id,
                date=e.timestamp.isoformat(),
                type=etype,
                bill_number=e.bill_number,
                fullGiven=total_full,
                emptyCollected=total_empty,
                amount=bill_amt,
                paid=paid,
                finRunBal=float(e.closing_balance) if e.closing_balance is not None else 0.0,
                cylRunBal=int(getattr(e, 'closing_cylinders', 0))
            )
        )
        
    next_cursor = entries[-1].id if len(entries) == limit else None
        
    return {"items": ledger, "next_cursor": next_cursor}

@router.put("/buyers/{buyer_id}", response_model=BuyerOut)
async def update_buyer(
    buyer_id: uuid.UUID,
    buyer_in: BuyerUpdate,
    db: AsyncSession = Depends(get_tenant_db),
):
    from sqlalchemy.orm import selectinload

    buyer = await db.get(Buyer, buyer_id, options=[selectinload(Buyer.inventory)])
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")

    if buyer_in.name is not None:
        buyer.name = buyer_in.name
    if buyer_in.phone is not None:
        buyer.phone = buyer_in.phone
    if buyer_in.type is not None:
        buyer.type = buyer_in.type
    if buyer_in.address is not None:
        buyer.address = buyer_in.address
    if buyer_in.is_active is not None:
        buyer.is_active = buyer_in.is_active
    if buyer_in.price_per_kg is not None:
        buyer.price_per_kg = buyer_in.price_per_kg

    await db.commit()
    await db.refresh(buyer, ['inventory'])
    return buyer


@router.delete("/buyers/{buyer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_buyer(
    buyer_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db),
):
    buyer = await db.get(Buyer, buyer_id)
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")
        
    has_history = await db.scalar(
        select(DeliveryBill).where(DeliveryBill.buyer_id == buyer_id).limit(1)
    )
    if has_history:
        raise HTTPException(status_code=400, detail="Cannot delete buyer with an existing billing history. Please disable the buyer instead.")
        
    await db.delete(buyer)
    await db.commit()


# --- DRIVERS ---
@router.post("/drivers", response_model=UserOut)
async def create_driver(
    user_in: UserCreate,
    current_user: User = Depends(require_tenant_admin()),
    db: AsyncSession = Depends(get_platform_db),
):
    org_id = current_user.organization_id
    
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check user limit
    user_count = await db.scalar(select(func.count(User.id)).where(User.organization_id == org_id))
    if user_count and user_count >= org.max_users:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="USER_LIMIT_REACHED")
    driver = User(
        username=user_in.username,
        password_hash=get_password_hash(user_in.password),
        role=UserRole.DRIVER,
        organization_id=org_id,
        is_active=user_in.is_active,
    )
    db.add(driver)
    
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if "uq_users_username" in str(e.orig):
            raise HTTPException(status_code=400, detail="Username is already taken globally")
        raise e

    await db.refresh(driver)
    return driver


@router.get("/drivers", response_model=list[UserOut])
async def list_drivers(
    current_user: User = Depends(require_tenant_admin()),
    db: AsyncSession = Depends(get_platform_db),
):
    org_id = current_user.organization_id
    result = await db.scalars(
        select(User).where(User.organization_id == org_id, User.role == UserRole.DRIVER)
    )
    return result.all()


@router.put("/drivers/{driver_id}", response_model=UserOut)
async def update_driver(
    driver_id: uuid.UUID,
    user_in: UserUpdate,
    current_user: User = Depends(require_tenant_admin()),
    db: AsyncSession = Depends(get_platform_db),
):
    org_id = current_user.organization_id
    driver = await db.get(User, driver_id)
    if not driver or driver.organization_id != org_id or driver.role != UserRole.DRIVER:
        raise HTTPException(status_code=404, detail="Driver not found")

    if user_in.is_active is not None:
        driver.is_active = user_in.is_active
    
    if user_in.password is not None:
        driver.password_hash = get_password_hash(user_in.password)

    await db.commit()
    await db.refresh(driver)
    return driver


@router.delete("/drivers/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_driver(
    driver_id: uuid.UUID,
    current_user: User = Depends(require_tenant_admin()),
    db: AsyncSession = Depends(get_platform_db),
):
    org_id = current_user.organization_id
    driver = await db.get(User, driver_id)
    if not driver or driver.organization_id != org_id or driver.role != UserRole.DRIVER:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    await db.delete(driver)
    await db.commit()



# --- REPORTS ---
@router.get("/reports/sales/pdf")
async def generate_sales_pdf_endpoint(
    date_mode: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    buyer_ids: Optional[str] = None,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: User = Depends(require_tenant_admin()),
    platform_db: AsyncSession = Depends(get_platform_db),
):
    from app.models import Buyer, DeliveryItem
    from app.services.reports.sales_pdf import (
        SalesPdfBillData,
        SalesPdfBuyerSummary,
        SalesPdfData,
        SalesPdfItemData,
        generate_sales_pdf,
    )

    # Base query
    stmt = select(DeliveryBill).options(
        selectinload(DeliveryBill.items).selectinload(DeliveryItem.item),
        selectinload(DeliveryBill.buyer)
    )

    filters = []

    # Date Filtering
    date_display_text = ""
    if date_mode == 'single' and start_date:
        dt = datetime.datetime.fromisoformat(start_date)
        dt_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
        dt_end = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        filters.append(DeliveryBill.timestamp >= dt_start)
        filters.append(DeliveryBill.timestamp <= dt_end)
        date_display_text = dt.strftime("%d-%m-%Y")
    elif date_mode == 'range' and start_date and end_date:
        dt1 = datetime.datetime.fromisoformat(start_date)
        dt2 = datetime.datetime.fromisoformat(end_date)
        dt_start = dt1.replace(hour=0, minute=0, second=0, microsecond=0)
        dt_end = dt2.replace(hour=23, minute=59, second=59, microsecond=999999)
        filters.append(DeliveryBill.timestamp >= dt_start)
        filters.append(DeliveryBill.timestamp <= dt_end)
        date_display_text = f"{dt1.strftime('%d-%m-%Y')} to {dt2.strftime('%d-%m-%Y')}"
    elif date_mode == 'month' and start_date:
        dates = start_date.split(',')
        month_filters = []
        display_months = []
        for d in dates:
            dt = datetime.datetime.fromisoformat(d)
            dt_start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if dt_start.month == 12:
                dt_end = dt_start.replace(year=dt_start.year+1, month=1, day=1) - datetime.timedelta(seconds=1)
            else:
                dt_end = dt_start.replace(month=dt_start.month+1, day=1) - datetime.timedelta(seconds=1)
            month_filters.append(
                and_(DeliveryBill.timestamp >= dt_start, DeliveryBill.timestamp <= dt_end)
            )
            display_months.append(dt.strftime("%b %Y"))
        if month_filters:
            filters.append(or_(*month_filters))
        date_display_text = ", ".join(display_months)
    elif date_mode == 'year' and start_date:
        dates = start_date.split(',')
        year_filters = []
        display_years = []
        for d in dates:
            dt = datetime.datetime.fromisoformat(d)
            dt_start = dt.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            dt_end = dt_start.replace(year=dt_start.year+1, month=1, day=1) - datetime.timedelta(seconds=1)
            year_filters.append(
                and_(DeliveryBill.timestamp >= dt_start, DeliveryBill.timestamp <= dt_end)
            )
            display_years.append(dt.strftime("%Y"))
        if year_filters:
            filters.append(or_(*year_filters))
        date_display_text = ", ".join(display_years)

    if filters:
        stmt = stmt.where(and_(*filters))

    if buyer_ids:
        b_ids = [uuid.UUID(pid.strip()) for pid in buyer_ids.split(',')]
        stmt = stmt.where(DeliveryBill.buyer_id.in_(b_ids))

    stmt = stmt.order_by(DeliveryBill.timestamp.asc())
    result = await db.execute(stmt)
    bills = result.scalars().all()

    # Determine buyer info
    buyer_name = "Multiple Buyers"
    buyer_phone = ""

    if buyer_ids and len(buyer_ids.split(',')) == 1:
        b_id = uuid.UUID(buyer_ids.strip())
        b_stmt = select(Buyer).where(Buyer.id == b_id)
        b_res = await db.execute(b_stmt)
        buyer = b_res.scalar_one_or_none()
        if buyer:
            buyer_name = buyer.name
            buyer_phone = buyer.phone or ""

    # Fetch Organization info
    org_name = "Gas Agency"
    org_address = ""
    org_phone = ""
    from app.models.organization import Organization
    org_stmt = select(Organization).where(Organization.id == current_user.organization_id)
    org_res = await platform_db.execute(org_stmt)
    org = org_res.scalar_one_or_none()
    if org:
        org_name = org.name
        org_address = org.address or ""
        org_phone = org.phone or ""

    # Group bills by buyer
    buyer_groups = {}
    for b in bills:
        b_name = b.buyer.name if b.buyer else "Unknown Buyer"
        if b_name not in buyer_groups:
            buyer_groups[b_name] = []
        buyer_groups[b_name].append(b)
        
    buyer_summaries = []
    
    # Sort buyer names alphabetically
    for b_name in sorted(buyer_groups.keys()):
        sales_bills = []
        buyer_total = 0.0
        
        for b in buyer_groups[b_name]:
            items_data = []
            for e in b.items:
                items_data.append(SalesPdfItemData(
                    item_name=e.item.name,
                    qty=e.full_delivered,
                    rate=float(e.unit_price_at_delivery),
                    amount=float(e.line_total_amount)
                ))
                buyer_total += float(e.line_total_amount)
                
            sales_bills.append(SalesPdfBillData(
                date=b.timestamp.strftime("%d-%m-%Y"),
                bill_no=b.bill_number or str(b.id)[:8],
                items=items_data
            ))
            
        buyer_summaries.append(SalesPdfBuyerSummary(
            buyer_name=b_name,
            bills=sales_bills,
            total_amount=buyer_total
        ))

    pdf_data = SalesPdfData(
        org_name=org_name,
        org_address=org_address,
        org_phone=org_phone,
        buyer_name=buyer_name if buyer_name != "Multiple Buyers" else "Multiple Buyers",
        buyer_phone=buyer_phone,
        date_display_text=f"Sales Report: {date_display_text}",
        buyer_summaries=buyer_summaries
    )

    pdf_buffer = generate_sales_pdf(pdf_data)

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=Sales_Report.pdf"}
    )


@router.get("/reports/purchases/pdf")
async def generate_purchase_pdf_endpoint(
    date_mode: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    provider_ids: Optional[str] = None,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: User = Depends(require_tenant_admin()),
    platform_db: AsyncSession = Depends(get_platform_db),
):
    from app.services.reports.purchase_pdf import (
        PurchasePdfBillData,
        PurchasePdfData,
        PurchasePdfItemData,
        generate_purchase_pdf,
    )

    # Base query
    stmt = select(PurchaseBill).options(
        selectinload(PurchaseBill.entries).selectinload(PurchaseEntry.item),
        selectinload(PurchaseBill.provider)
    )

    filters = []

    # Date Filtering
    date_display_text = ""
    if date_mode == 'single' and start_date:
        dt = datetime.datetime.fromisoformat(start_date)
        dt_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
        dt_end = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        filters.append(PurchaseBill.created_at >= dt_start)
        filters.append(PurchaseBill.created_at <= dt_end)
        date_display_text = dt.strftime("%d-%m-%Y")
    elif date_mode == 'range' and start_date and end_date:
        dt1 = datetime.datetime.fromisoformat(start_date)
        dt2 = datetime.datetime.fromisoformat(end_date)
        dt_start = dt1.replace(hour=0, minute=0, second=0, microsecond=0)
        dt_end = dt2.replace(hour=23, minute=59, second=59, microsecond=999999)
        filters.append(PurchaseBill.created_at >= dt_start)
        filters.append(PurchaseBill.created_at <= dt_end)
        date_display_text = f"{dt1.strftime('%d-%m-%Y')} to {dt2.strftime('%d-%m-%Y')}"
    elif date_mode == 'month' and start_date:
        dates = start_date.split(',')
        month_filters = []
        display_months = []
        for d in dates:
            dt = datetime.datetime.fromisoformat(d)
            dt_start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if dt_start.month == 12:
                dt_end = dt_start.replace(year=dt_start.year+1, month=1, day=1) - datetime.timedelta(seconds=1)
            else:
                dt_end = dt_start.replace(month=dt_start.month+1, day=1) - datetime.timedelta(seconds=1)
            month_filters.append(
                and_(PurchaseBill.created_at >= dt_start, PurchaseBill.created_at <= dt_end)
            )
            display_months.append(dt.strftime("%b %Y"))
        if month_filters:
            filters.append(or_(*month_filters))
        date_display_text = ", ".join(display_months)
    elif date_mode == 'year' and start_date:
        dates = start_date.split(',')
        year_filters = []
        display_years = []
        for d in dates:
            dt = datetime.datetime.fromisoformat(d)
            dt_start = dt.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            dt_end = dt_start.replace(year=dt_start.year+1, month=1, day=1) - datetime.timedelta(seconds=1)
            year_filters.append(
                and_(PurchaseBill.created_at >= dt_start, PurchaseBill.created_at <= dt_end)
            )
            display_years.append(dt.strftime("%Y"))
        if year_filters:
            filters.append(or_(*year_filters))
        date_display_text = ", ".join(display_years)

    if provider_ids:
        # provider_ids is comma separated string of UUIDs
        import uuid
        p_ids = [uuid.UUID(x.strip()) for x in provider_ids.split(",") if x.strip()]
        if p_ids:
            filters.append(PurchaseBill.provider_id.in_(p_ids))
            
    if filters:
        stmt = stmt.where(and_(*filters))
        
    stmt = stmt.order_by(PurchaseBill.created_at.asc())
    
    result = await db.scalars(stmt)
    bills_db = result.all()

    # Get org details
    org = await platform_db.get(Organization, current_user.organization_id)
    org_name = org.name if org else "Organization"
    org_address = org.address or "" if org else ""
    org_phone = org.phone or "" if org else ""
    
    # Provider details
    provider_name = "Various Providers"
    provider_gstin = ""
    provider_phone = ""
    
    if provider_ids and len(provider_ids.split(",")) == 1:
        # Single provider
        try:
            p_id = provider_ids.split(",")[0].strip()
            if p_id:
                provider = await db.get(Provider, p_id)
                if provider:
                    provider_name = provider.name
                    provider_phone = getattr(provider, "phone", "") or ""
                    provider_gstin = getattr(provider, "gstin", "") or ""
        except Exception:
            pass

    pdf_bills = []
    for b in bills_db:
        pdf_items = []
        # get provider rate
        price_val = getattr(b.provider, 'price_per_kg', None)
        price_per_kg = float(price_val) if price_val is not None else 0.0
        for entry in b.entries:
            qty = entry.full_received
            if qty <= 0:
                continue
            capacity = float(entry.item.capacity_kg) if entry.item.capacity_kg else 0.0
            rate = price_per_kg * capacity
            amount = qty * rate
            gst_percent = float(entry.item.gst_percent) if entry.item.gst_percent else 0.0
            hsn = entry.item.hsn_code or ""
            
            pdf_items.append(PurchasePdfItemData(
                item_name=entry.item.name,
                hsn=hsn,
                qty=qty,
                rate=rate,
                gst_percent=gst_percent,
                amount=amount
            ))
            
        if pdf_items:
            b_date_str = b.created_at.strftime("%d-%m-%Y")
            bill_no_str = b.bill_number or "N/A"
            pdf_bills.append(PurchasePdfBillData(
                date=b_date_str,
                bill_no=bill_no_str,
                items=pdf_items
            ))

    data = PurchasePdfData(
        org_name=org_name,
        org_gstin="", # Assume org gstin not in model
        org_address=org_address,
        org_phone=org_phone,
        provider_name=provider_name,
        provider_gstin=provider_gstin,
        provider_phone=provider_phone,
        date_display_text=date_display_text,
        bills=pdf_bills
    )

    pdf_buffer = generate_purchase_pdf(data)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Purchase_Report_{date_display_text.replace(' ', '_')}.pdf"}
    )


@router.get("/reports/inventory/pdf")
async def generate_inventory_pdf_endpoint(
    current_user: User = Depends(require_tenant_admin()),
    db: AsyncSession = Depends(get_tenant_db),
    platform_db: AsyncSession = Depends(get_platform_db),
):
    import datetime

    from sqlalchemy import select

    from app.models import Item, Organization
    from app.services.reports.inventory_pdf import (
        InventoryPdfData,
        InventoryPdfItemData,
        generate_inventory_pdf,
    )
    
    # 1. Fetch Organization Details
    org = await platform_db.get(Organization, current_user.organization_id)
    org_name = org.name if org else "Organization"
    org_address = org.address or "" if org else ""
    org_phone = org.phone or "" if org else ""

    # 2. Fetch all active items
    result = await db.execute(
        select(Item)
        .where(Item.is_active)
        .order_by(Item.name.asc())
    )
    items_db = result.scalars().all()
    
    pdf_items = []
    for item in items_db:
        pdf_items.append(InventoryPdfItemData(
            item_name=item.name,
            price=float(item.price),
            current_full=item.current_full,
            current_empty=item.current_empty
        ))
        
    data = InventoryPdfData(
        org_name=org_name,
        org_address=org_address,
        org_phone=org_phone,
        items=pdf_items
    )
    
    pdf_buffer = generate_inventory_pdf(data)
    
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Inventory_Report_{date_str}.pdf"}
    )
