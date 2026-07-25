from uuid import UUID

from pydantic import BaseModel, ConfigDict


class InventoryItem(BaseModel):
    item_id: UUID
    cylinders_pending: int

    model_config = ConfigDict(from_attributes=True)
