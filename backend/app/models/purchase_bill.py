from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

from ..core.ids import UUID_SQL_TYPE, uuid7
from .base import BaseModelMixin

if TYPE_CHECKING:
    from .provider import Provider
    from .purchase_entry import PurchaseEntry

class PurchaseBill(Base, BaseModelMixin):
    __tablename__ = "purchase_bills"
    __table_args__ = (
        Index("idx_purchase_pagination", "created_at", "id"),
        {"schema": "tenant"}
    )

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, default=uuid7, index=True)
    provider_id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, ForeignKey("tenant.providers.id"), nullable=False, index=True)
    
    bill_number: Mapped[str | None] = mapped_column(String, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    
    total_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    amount_paid: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    
    opening_balance: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    closing_balance: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    price_per_kg: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    
    # Relationship to entries
    entries: Mapped[list["PurchaseEntry"]] = relationship("PurchaseEntry", back_populates="bill", cascade="all, delete-orphan", lazy="selectin")
    provider: Mapped["Provider"] = relationship("Provider")
