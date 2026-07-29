"""Add opening and closing balances to PurchaseBill

Revision ID: eb298a38e4de
Revises: fcd17703ca13
Create Date: 2026-07-29 10:16:50.990076

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eb298a38e4de'
down_revision: Union[str, Sequence[str], None] = 'fcd17703ca13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2);")
    op.execute("ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(12, 2);")

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('purchase_bills', 'closing_balance')
    op.drop_column('purchase_bills', 'opening_balance')
