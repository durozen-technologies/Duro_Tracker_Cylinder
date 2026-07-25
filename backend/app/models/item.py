from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Enum, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from ..core.ids import UUID_SQL_TYPE, uuid7
from ..db.database import Base
from .base import BaseModelMixin
from .enums import ItemCategory


class Item(Base, BaseModelMixin):
    __tablename__ = "items"
    __table_args__ = (
        CheckConstraint("current_full >= 0", name="chk_item_full_positive"),
        CheckConstraint("current_empty >= 0", name="chk_item_empty_positive"),
        {"schema": "tenant"}
    )

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, index=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[ItemCategory] = mapped_column(Enum(ItemCategory), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    capacity_kg: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    hsn_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gst_percent: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    
    # Base snapshot
    initial_full: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    initial_empty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Running totals for fast dashboard queries
    current_full: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_empty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # No direct relationship back to deliveries needed right now
