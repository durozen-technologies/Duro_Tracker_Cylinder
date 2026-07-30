import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

from app.auth.dependencies import get_tenant_db, require_tenant_admin
from app.models import Item, Provider, PurchaseBill, PurchaseEntry
from app.schemas.provider import ProviderCreate, ProviderOut, ProviderUpdate
from app.schemas.purchase import PurchaseBillCreate, PurchaseBillOut

router = APIRouter(dependencies=[Depends(require_tenant_admin())], tags=["Purchases"])

@router.post("/providers", response_model=ProviderOut)
async def create_provider(
    provider_in: ProviderCreate,
    db: AsyncSession = Depends(get_tenant_db),
):
    from app.models.provider import ProviderInventory
    provider = Provider(
        name=provider_in.name,
        phone=provider_in.phone,
        gstin=provider_in.gstin,
        price_per_kg=provider_in.price_per_kg,
        balance_pending=provider_in.balance_pending,
        is_active=provider_in.is_active,
    )
    if provider_in.inventory:
        provider.inventory = [
            ProviderInventory(item_id=inv.item_id, cylinders_pending=inv.cylinders_pending)
            for inv in provider_in.inventory
        ]
    db.add(provider)
    await db.commit()
    await db.refresh(provider, ['inventory'])
    return provider

@router.put("/providers/{provider_id}", response_model=ProviderOut)
async def update_provider(
    provider_id: uuid.UUID,
    provider_in: ProviderUpdate,
    db: AsyncSession = Depends(get_tenant_db),
):
    from app.models.provider import ProviderInventory
    provider = await db.get(Provider, provider_id, options=[selectinload(Provider.inventory)])
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    if provider_in.name is not None:
        provider.name = provider_in.name
    if provider_in.phone is not None:
        provider.phone = provider_in.phone
    if provider_in.gstin is not None:
        provider.gstin = provider_in.gstin
    if provider_in.price_per_kg is not None:
        provider.price_per_kg = provider_in.price_per_kg
    if provider_in.balance_pending is not None:
        provider.balance_pending = provider_in.balance_pending
    if provider_in.is_active is not None:
        provider.is_active = provider_in.is_active
    if provider_in.inventory is not None:
        # Update existing inventory or add new ones
        existing_inventory = {inv.item_id: inv for inv in provider.inventory}
        for new_inv in provider_in.inventory:
            if new_inv.item_id in existing_inventory:
                existing_inventory[new_inv.item_id].cylinders_pending = new_inv.cylinders_pending
            else:
                provider.inventory.append(ProviderInventory(item_id=new_inv.item_id, cylinders_pending=new_inv.cylinders_pending))
        # Remove ones not in the incoming list
        incoming_ids = {inv.item_id for inv in provider_in.inventory}
        provider.inventory = [inv for inv in provider.inventory if inv.item_id in incoming_ids]

    await db.commit()
    await db.refresh(provider, ['inventory'])
    return provider

@router.get("/providers", response_model=list[ProviderOut])
async def list_providers(
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await db.scalars(select(Provider).options(selectinload(Provider.inventory)))
    return result.all()

@router.post("/", response_model=PurchaseBillOut)
async def create_purchase_bill(
    bill_in: PurchaseBillCreate,
    x_idempotency_key: Annotated[str, Header(min_length=1)],
    db: AsyncSession = Depends(get_tenant_db),
):
    try:
        async with db.begin_nested() if db.in_transaction() else db.begin():
            from sqlalchemy import text
            await db.execute(text("SET LOCAL lock_timeout = '3s';"))
            
            provider = await db.scalar(
                select(Provider)
                .options(selectinload(Provider.inventory))
                .where(Provider.id == bill_in.provider_id)
                .with_for_update()
            )
            if not provider:
                raise HTTPException(status_code=404, detail="Provider not found")
                
            if bill_in.amount_paid > float(provider.balance_pending) + float(bill_in.total_cost):
                raise HTTPException(status_code=409, detail="Amount paid cannot exceed provider pending balance plus total cost")
                
            import datetime
            bill_timestamp = bill_in.timestamp if bill_in.timestamp else datetime.datetime.now(datetime.UTC)
            if bill_timestamp.tzinfo is None:
                bill_timestamp = bill_timestamp.replace(tzinfo=datetime.UTC)

            opening_balance = float(provider.balance_pending)
            closing_balance = opening_balance + float(bill_in.total_cost) - float(bill_in.amount_paid)

            bill = PurchaseBill(
                provider_id=bill_in.provider_id,
                bill_number=bill_in.bill_number,
                total_cost=bill_in.total_cost,
                amount_paid=bill_in.amount_paid,
                opening_balance=opening_balance,
                closing_balance=closing_balance,
                price_per_kg=bill_in.price_per_kg,
                idempotency_key=x_idempotency_key,
                created_at=bill_timestamp
            )
            db.add(bill)
            
            total_full_received = 0
            total_empty_returned = 0
            
            sorted_items = sorted(bill_in.items, key=lambda x: str(x.item_id))
            
            for item_in in sorted_items:
                item = await db.scalar(select(Item).where(Item.id == item_in.item_id).with_for_update())
                if not item:
                    raise HTTPException(status_code=404, detail=f"Item {item_in.item_id} not found")
                    
                entry = PurchaseEntry(
                    bill=bill,
                    item_id=item.id,
                    full_received=item_in.full_received,
                    empty_returned=item_in.empty_returned,
                    total_cost=item_in.total_cost,
                )
                db.add(entry)
                
                # Update Item counts
                item.current_full += item_in.full_received
                item.current_empty -= item_in.empty_returned
                if item.current_empty < 0:
                    raise HTTPException(status_code=400, detail=f"Not enough empty cylinders in warehouse for item {item.name}")
                
                # Update Provider Inventory
                from app.models.provider import ProviderInventory
                provider_inv = next((inv for inv in provider.inventory if inv.item_id == item.id), None)
                if not provider_inv:
                    provider_inv = ProviderInventory(item_id=item.id, cylinders_pending=0)
                    provider.inventory.append(provider_inv)
                provider_inv.cylinders_pending += item_in.empty_returned
                provider_inv.cylinders_pending -= item_in.full_received
                if provider_inv.cylinders_pending < 0:
                    raise HTTPException(status_code=400, detail=f"Provider cannot give more full cylinders than the empty ones they have pending for item {item.name}")
                
                total_full_received += item_in.full_received
                total_empty_returned += item_in.empty_returned
                
            # Update Provider Balances
            provider.balance_pending = float(provider.balance_pending) + bill_in.total_cost
            provider.balance_pending = float(provider.balance_pending) - bill_in.amount_paid
            
            await db.flush()
            bill_id = bill.id
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if "idempotency_key" in str(e.orig):
            existing_bill = await db.scalar(
                select(PurchaseBill)
                .options(joinedload(PurchaseBill.provider), selectinload(PurchaseBill.entries).joinedload(PurchaseEntry.item))
                .where(PurchaseBill.idempotency_key == x_idempotency_key)
            )
            if existing_bill:
                return existing_bill
        raise e
    
    final_bill = await db.scalar(
        select(PurchaseBill)
        .options(joinedload(PurchaseBill.provider), selectinload(PurchaseBill.entries).joinedload(PurchaseEntry.item))
        .where(PurchaseBill.id == bill_id)
    )
    return final_bill

@router.get("/")
async def list_purchase_bills(
    paginated: bool = False,
    cursor: uuid.UUID | None = None,
    limit: int = Query(20, ge=1, le=100),
    provider_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_tenant_db),
):
    query = select(PurchaseBill).options(selectinload(PurchaseBill.entries))
    
    if provider_id:
        query = query.filter(PurchaseBill.provider_id == provider_id)
    
    if paginated:
        if cursor:
            query = query.filter(PurchaseBill.id < cursor)
        query = query.order_by(PurchaseBill.id.desc()).limit(limit)
        result = await db.scalars(query)
        items = result.all()
        next_cursor = items[-1].id if len(items) == limit else None
        return {"items": items, "next_cursor": next_cursor}
    else:
        query = query.order_by(PurchaseBill.id.desc()).limit(100)
        result = await db.scalars(query)
        return result.all()
