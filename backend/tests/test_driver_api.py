import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item


@pytest.mark.asyncio
async def test_idempotent_delivery_entry(
    client: AsyncClient, 
    driver_token: str,
    db: AsyncSession,
):
    headers = {"Authorization": f"Bearer {driver_token}"}

    # 1. Create an item via admin API or DB directly to test against
    item = Item(
        name="19kg Commercial",
        category="commercial",
        price=2000.0,
        initial_full=100,
        initial_empty=10,
        current_full=100,
        current_empty=10,
        is_active=True,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    # 2. Make delivery bill with idempotency key
    payload = {
        "items": [
            {
                "item_id": str(item.id),
                "full_delivered": 5,
                "empty_received": 5
            }
        ],
        "cash_collected": 10000.0,
        "upi_collected": 0.0,
        "adhoc_buyer_name": "Walk-in John",
    }
    idem_key = "test-idempotency-key-123"

    response1 = await client.post(
        "/api/v1/driver/entries", 
        json=payload, 
        headers={**headers, "X-Idempotency-Key": idem_key}
    )
    assert response1.status_code == 200
    data1 = response1.json()
    assert data1["idempotency_key"] == idem_key
    assert data1["total_bill_amount"] == 10000.0
    
    # 3. Repeat the exact same request
    response2 = await client.post(
        "/api/v1/driver/entries", 
        json=payload, 
        headers={**headers, "X-Idempotency-Key": idem_key}
    )
    assert response2.status_code == 200
    data2 = response2.json()
    assert data1["id"] == data2["id"]  # Must be the exact same entry

    # 4. Verify inventory only decreased by 5, not 10 (idempotency worked)
    await db.refresh(item)
    assert item.current_full == 95
    assert item.current_empty == 15


@pytest.mark.asyncio
async def test_debt_collection(
    client: AsyncClient,
    driver_token: str,
    db: AsyncSession,
):
    headers = {"Authorization": f"Bearer {driver_token}"}

    # 1. Create a buyer with some initial balance pending
    from app.models import Buyer
    from app.models.enums import BuyerType
    buyer = Buyer(
        name="Debt Collection Test Buyer",
        address="123 Test St",
        balance_pending=1000.0,
        type=BuyerType.COMMERCIAL,
        is_active=True,
    )
    db.add(buyer)
    await db.commit()
    await db.refresh(buyer)

    # 2. Collect Debt
    payload = {
        "buyer_id": str(buyer.id),
        "cash_collected": 500.0,
        "upi_collected": 200.0,
    }
    idem_key = "test-debt-collection-key"

    response = await client.post(
        "/api/v1/driver/collections",
        json=payload,
        headers={**headers, "X-Idempotency-Key": idem_key}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["cash_collected"] == 500.0
    assert data["upi_collected"] == 200.0
    assert data["total_bill_amount"] == 0.0
    assert data["bill_number"].startswith("PAY-")

    # Verify Buyer Balance
    await db.refresh(buyer)
    # Original balance was 1000. We collected 700. Remaining should be 300.
    assert float(buyer.balance_pending) == 300.0
