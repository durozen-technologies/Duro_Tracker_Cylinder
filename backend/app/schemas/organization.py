from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class OrganizationBase(BaseModel):
    name: str
    max_users: int = 10
    address: str | None = None
    phone: str | None = None
    bill_prefix_sales: str = "SHA"
    bill_prefix_collection: str = "PAY"


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationUpdate(BaseModel):
    name: str | None = None
    max_users: int | None = None
    address: str | None = None
    phone: str | None = None
    bill_prefix_sales: str | None = None
    bill_prefix_collection: str | None = None


class OrganizationOut(OrganizationBase):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
