from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

from ..core.ids import UUID_SQL_TYPE, uuid7
from .base import BaseModelMixin


class Provider(Base, BaseModelMixin):
    __tablename__ = "providers"
    __table_args__ = {"schema": "tenant"}

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, default=uuid7, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    gstin: Mapped[Optional[str]] = mapped_column(String(50))
    price_per_kg: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    balance_pending: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    purchases = relationship("PurchaseBill", back_populates="provider")
    inventory = relationship("ProviderInventory", back_populates="provider", cascade="all, delete-orphan", lazy="selectin")

class ProviderInventory(Base, BaseModelMixin):
    __tablename__ = "provider_inventory"
    __table_args__ = (
        CheckConstraint("cylinders_pending >= 0", name="chk_provider_inv_positive"),
        {"schema": "tenant"}
    )

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, index=True, default=uuid7)
    provider_id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, ForeignKey("tenant.providers.id"), nullable=False)
    item_id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, ForeignKey("tenant.items.id"), nullable=False)
    cylinders_pending: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    provider = relationship("Provider", back_populates="inventory")
    item = relationship("Item")
