from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.ids import UUID_SQL_TYPE, uuid7
from ..db.database import Base
from .base import BaseModelMixin


class DeliveryBill(Base, BaseModelMixin):
    __tablename__ = "delivery_bills"
    __table_args__ = (
        Index("idx_delivery_pagination", "timestamp", "id"),
        {"schema": "tenant"}
    )

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, index=True, default=uuid7)
    driver_id: Mapped[UUID | None] = mapped_column(
        UUID_SQL_TYPE, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    buyer_id: Mapped[UUID | None] = mapped_column(
        UUID_SQL_TYPE, ForeignKey("tenant.buyers.id", ondelete="SET NULL"), index=True, nullable=True
    )
    adhoc_buyer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bill_number: Mapped[str | None] = mapped_column(String(50), unique=True, index=True, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    
    # Financial movement
    total_bill_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    cash_collected: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    upi_collected: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    
    # Financial snapshots
    opening_balance: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    closing_balance: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    
    # Cylinder snapshot
    closing_cylinders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    driver = relationship("User", lazy="joined")
    buyer = relationship("Buyer", back_populates="deliveries", lazy="joined")
    
    items: Mapped[list["DeliveryItem"]] = relationship(
        "DeliveryItem", back_populates="bill", cascade="all, delete-orphan", lazy="selectin"
    )

class DeliveryItem(Base, BaseModelMixin):
    __tablename__ = "delivery_items"
    __table_args__ = {"schema": "tenant"}

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, index=True, default=uuid7)
    delivery_bill_id: Mapped[UUID] = mapped_column(
        UUID_SQL_TYPE, ForeignKey("tenant.delivery_bills.id", ondelete="CASCADE"), index=True, nullable=False
    )
    item_id: Mapped[UUID] = mapped_column(
        UUID_SQL_TYPE, ForeignKey("tenant.items.id"), index=True, nullable=False
    )
    
    # Pricing snapshot to avoid historical corruption
    unit_price_at_delivery: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    line_total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    
    # Physical movement
    full_delivered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    empty_received: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    buyer_holding_snapshot: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    bill: Mapped["DeliveryBill"] = relationship("DeliveryBill", back_populates="items")
    item = relationship("Item")
