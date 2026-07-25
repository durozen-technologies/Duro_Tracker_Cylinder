from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

from ..core.ids import UUID_SQL_TYPE, uuid7
from .base import BaseModelMixin

if TYPE_CHECKING:
    from .item import Item
    from .purchase_bill import PurchaseBill

class PurchaseEntry(Base, BaseModelMixin):
    __tablename__ = "purchase_entries"
    __table_args__ = {"schema": "tenant"}

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, default=uuid7, index=True)
    purchase_bill_id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, ForeignKey("tenant.purchase_bills.id"), nullable=False, index=True)
    item_id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, ForeignKey("tenant.items.id"), nullable=False, index=True)
    
    full_received: Mapped[int] = mapped_column(Integer, default=0)
    empty_returned: Mapped[int] = mapped_column(Integer, default=0)
    
    total_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    
    bill: Mapped["PurchaseBill"] = relationship("PurchaseBill", back_populates="entries")
    item: Mapped["Item"] = relationship("Item")
