from uuid import UUID

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.ids import UUID_SQL_TYPE, uuid7
from ..db.database import Base
from .base import BaseModelMixin


class Organization(Base, BaseModelMixin):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(UUID_SQL_TYPE, primary_key=True, index=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    max_users: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    address: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bill_prefix_sales: Mapped[str] = mapped_column(String(20), default="SHA", nullable=False)
    bill_prefix_collection: Mapped[str] = mapped_column(String(20), default="PAY", nullable=False)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
