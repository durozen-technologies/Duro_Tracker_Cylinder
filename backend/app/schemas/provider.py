from uuid import UUID

from pydantic import BaseModel, ConfigDict

from .inventory import InventoryItem


class ProviderBase(BaseModel):
    name: str
    phone: str | None = None
    gstin: str | None = None
    price_per_kg: float | None = None
    is_active: bool = True

class ProviderCreate(ProviderBase):
    balance_pending: float = 0.0
    inventory: list[InventoryItem] | None = None

class ProviderUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    gstin: str | None = None
    price_per_kg: float | None = None
    is_active: bool | None = None
    balance_pending: float | None = None
    inventory: list[InventoryItem] | None = None

class ProviderOut(ProviderBase):
    id: UUID
    balance_pending: float
    inventory: list[InventoryItem] = []

    model_config = ConfigDict(from_attributes=True)

class ProviderSummary(BaseModel):
    id: UUID
    name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
