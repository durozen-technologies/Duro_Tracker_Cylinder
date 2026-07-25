from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import UserRole


class UserBase(BaseModel):
    username: str
    role: UserRole
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    password: str | None = None
    is_active: bool | None = None


class UserOut(UserBase):
    id: UUID
    organization_id: UUID | None
    last_login_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
