"""Add composite indexes for pagination

Revision ID: 5b66fea9316a
Revises: 109347070dbc
Create Date: 2026-07-26 18:01:43.574881

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b66fea9316a'
down_revision: Union[str, Sequence[str], None] = '109347070dbc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE INDEX IF NOT EXISTS idx_ledger_pagination ON tenant.delivery_bills (buyer_id, id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_driver_pagination ON tenant.delivery_bills (driver_id, id);")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_driver_pagination', table_name='delivery_bills', schema='tenant')
    op.drop_index('idx_ledger_pagination', table_name='delivery_bills', schema='tenant')
