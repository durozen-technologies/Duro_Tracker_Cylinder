import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_tenant_db, require_tenant_admin
from app.models import Buyer, DeliveryBill, DeliveryItem, User

router = APIRouter(dependencies=[Depends(require_tenant_admin())])

class DashboardMetrics(BaseModel):
    total_dispatched: int
    total_empty_received: int
    total_cash_collected: float
    total_upi_collected: float
    outstanding_balance: float
    todays_sales: float

class RecentActivityOut(BaseModel):
    id: uuid.UUID
    type: str # 'delivery' or 'collection'
    message: str
    timestamp: str
    amount: float | None = None

@router.get("/metrics", response_model=DashboardMetrics)
async def get_dashboard_metrics(
    current_user: User = Depends(require_tenant_admin()),
    db: AsyncSession = Depends(get_tenant_db),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=403, detail="No organization")
        
    org_id = current_user.organization_id
    
    import zoneinfo
    ist = zoneinfo.ZoneInfo("Asia/Kolkata")
    now_ist = datetime.now(ist)
    start_of_today_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    # Convert IST midnight back to UTC for database querying
    start_of_today = start_of_today_ist.astimezone(timezone.utc)

    # Aggregate today's collection and sales from DeliveryBill
    bill_result = await db.execute(
        select(
            func.coalesce(func.sum(DeliveryBill.cash_collected), 0),
            func.coalesce(func.sum(DeliveryBill.upi_collected), 0),
            func.coalesce(func.sum(DeliveryBill.total_bill_amount), 0),
        ).where(DeliveryBill.timestamp >= start_of_today)
    )
    bill_row = bill_result.fetchone() or (0, 0, 0)
    
    # Aggregate today's item dispatches from DeliveryItem joined with DeliveryBill
    item_result = await db.execute(
        select(
            func.coalesce(func.sum(DeliveryItem.full_delivered), 0),
            func.coalesce(func.sum(DeliveryItem.empty_received), 0),
        ).join(DeliveryBill).where(DeliveryBill.timestamp >= start_of_today)
    )
    item_row = item_result.fetchone() or (0, 0)
    
    # Sum of all buyers' pending balances (All time)
    buyers_result = await db.execute(
        select(func.coalesce(func.sum(Buyer.balance_pending), 0))
    )
    outstanding_balance = buyers_result.scalar() or 0.0

    return DashboardMetrics(
        total_dispatched=int(item_row[0]),
        total_empty_received=int(item_row[1]),
        total_cash_collected=float(bill_row[0]),
        total_upi_collected=float(bill_row[1]),
        outstanding_balance=float(outstanding_balance),
        todays_sales=float(bill_row[2]),
    )

@router.get("/recent-activity", response_model=list[RecentActivityOut])
async def get_recent_activity(
    current_user: User = Depends(require_tenant_admin()),
    db: AsyncSession = Depends(get_tenant_db),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=403, detail="No organization")
        
    
    # Fetch last 20 deliveries using scalar aggregation to avoid ORM N+1 overhead
    query = (
        select(
            DeliveryBill.id,
            DeliveryBill.bill_number,
            DeliveryBill.timestamp,
            DeliveryBill.total_bill_amount,
            DeliveryBill.cash_collected,
            DeliveryBill.upi_collected,
            DeliveryBill.adhoc_buyer_name,
            User.username.label("driver_name"),
            Buyer.name.label("buyer_name"),
            func.coalesce(func.sum(DeliveryItem.full_delivered), 0).label("total_full")
        )
        .outerjoin(User, DeliveryBill.driver_id == User.id)
        .outerjoin(Buyer, DeliveryBill.buyer_id == Buyer.id)
        .outerjoin(DeliveryItem, DeliveryBill.id == DeliveryItem.delivery_bill_id)
        .group_by(
            DeliveryBill.id,
            DeliveryBill.bill_number,
            DeliveryBill.timestamp,
            DeliveryBill.total_bill_amount,
            DeliveryBill.cash_collected,
            DeliveryBill.upi_collected,
            DeliveryBill.adhoc_buyer_name,
            User.username,
            Buyer.name
        )
        .order_by(DeliveryBill.timestamp.desc())
        .limit(4)
    )
    
    result = await db.execute(query)
    entries = result.all()
    
    activities = []
    for row in entries:
        driver_name = row.driver_name if row.driver_name else "Unknown Driver"
        buyer_name = row.buyer_name if row.buyer_name else row.adhoc_buyer_name or "Unknown Buyer"
        
        total_full = row.total_full
        
        bill_prefix = f"[{row.bill_number}] " if row.bill_number else ""
        if total_full > 0:
            act_type = 'delivery'
            msg = f"{bill_prefix}Driver {driver_name} delivered {total_full} items to {buyer_name}"
            amt = float(row.total_bill_amount)
        elif row.cash_collected > 0 or row.upi_collected > 0:
            act_type = 'collection'
            msg = f"{bill_prefix}Driver {driver_name} collected payment from {buyer_name}"
            amt = float(row.cash_collected + row.upi_collected)
        else:
            act_type = 'delivery'
            msg = f"{bill_prefix}Driver {driver_name} recorded empty receipt from {buyer_name}"
            amt = 0.0
            
        activities.append(
            RecentActivityOut(
                id=row.id,
                type=act_type,
                message=msg,
                timestamp=row.timestamp.isoformat(),
                amount=amt,
            )
        )
        
    return activities
