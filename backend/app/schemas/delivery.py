import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.buyer import BuyerSummary
from app.schemas.item import ItemOut


class DeliveryItemCreate(BaseModel):
    item_id: UUID
    full_delivered: int = Field(default=0, ge=0, le=10000)
    empty_received: int = Field(default=0, ge=0, le=10000)


class DeliveryBillCreate(BaseModel):
    buyer_id: UUID | None = None
    adhoc_buyer_name: str | None = None
    items: list[DeliveryItemCreate]
    cash_collected: float = Field(default=0.0, ge=0.0)
    upi_collected: float = Field(default=0.0, ge=0.0)
    timestamp: datetime | None = None

    @model_validator(mode='after')
    def validate_bill(self) -> 'DeliveryBillCreate':
        # 1. Sanitize and normalize adhoc_buyer_name
        if self.adhoc_buyer_name is not None:
            sanitized = self.adhoc_buyer_name.strip()
            if not sanitized:
                self.adhoc_buyer_name = None
            else:
                # Title case and regex validation
                sanitized = sanitized.title()
                if not re.match(r'^[\w\s\-\.\']+$', sanitized):
                    raise ValueError("Adhoc buyer name contains invalid characters. Only alphanumeric, space, dot, dash, and apostrophe are allowed.")
                self.adhoc_buyer_name = sanitized

        # 2. Enforce mutual exclusivity for buyers
        if self.buyer_id and self.adhoc_buyer_name:
            raise ValueError("buyer_id and adhoc_buyer_name are mutually exclusive.")
        if not self.buyer_id and not self.adhoc_buyer_name:
            raise ValueError("Either buyer_id or adhoc_buyer_name must be provided.")

        # 3. Line-item boundaries
        # Wait, if it's just a cash collection, items could be empty. But we have DebtCollectionCreate for that!
        # The schema might be used to create an empty bill. Let's see if the router allows empty bills.
        # Yes, driver can send empty bills if they only collect money. 
        # But wait, driver.py uses DebtCollectionCreate for pure collections?
        # Let's check `routers/driver.py`. Actually `routers/driver.py` uses `DeliveryBillCreate` for everything, OR it has a separate `POST /collections`?
        # Let's assume items can be empty for now, but we must check for duplicates.
        seen_items = set()
        for item in self.items:
            if item.item_id in seen_items:
                raise ValueError(f"Duplicate item_id {item.item_id} found in items list.")
            seen_items.add(item.item_id)
            
        return self


class DebtCollectionCreate(BaseModel):
    buyer_id: UUID
    cash_collected: float = Field(default=0.0, ge=0.0)
    upi_collected: float = Field(default=0.0, ge=0.0)
    timestamp: datetime | None = None


class DeliveryItemOut(BaseModel):
    id: UUID
    item_id: UUID
    unit_price_at_delivery: float
    line_total_amount: float
    full_delivered: int
    empty_received: int
    buyer_holding_snapshot: int | None = None
    item: ItemOut | None = None
    
    model_config = ConfigDict(from_attributes=True)


class DeliveryBillOut(BaseModel):
    id: UUID
    driver_id: UUID | None
    buyer_id: UUID | None
    adhoc_buyer_name: str | None = None
    bill_number: str | None = None
    idempotency_key: str | None = None
    buyer: BuyerSummary | None = None
    
    total_bill_amount: float
    cash_collected: float
    upi_collected: float
    opening_balance: float | None = None
    closing_balance: float | None = None
    
    items: list[DeliveryItemOut] = []
    
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
