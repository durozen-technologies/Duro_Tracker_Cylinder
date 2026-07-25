from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.ids import UUID_SQL_TYPE, uuid7
from ..db.database import Base
from .base import BaseModelMixin
from .enums import BuyerType


class Buyer(Base, BaseModelMixin):
    __tablename__ = "buyers"
    __table_args__ = {"schema": "tenant"}

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, index=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    type: Mapped[BuyerType] = mapped_column(Enum(BuyerType), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    price_per_kg: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    
    # Financial debt and lifetime aggregates
    balance_pending: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total_lifetime_sales: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total_lifetime_paid: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    deliveries = relationship("DeliveryBill", back_populates="buyer")
    inventory = relationship("BuyerInventory", back_populates="buyer", cascade="all, delete-orphan", lazy="selectin")

class BuyerInventory(Base, BaseModelMixin):
    __tablename__ = "buyer_inventory"
    __table_args__ = (
        CheckConstraint("cylinders_pending >= 0", name="chk_buyer_inv_positive"),
        {"schema": "tenant"}
    )

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, index=True, default=uuid7)
    buyer_id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, ForeignKey("tenant.buyers.id"), nullable=False)
    item_id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, ForeignKey("tenant.items.id"), nullable=False)
    cylinders_pending: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    buyer = relationship("Buyer", back_populates="inventory")
    item = relationship("Item")
