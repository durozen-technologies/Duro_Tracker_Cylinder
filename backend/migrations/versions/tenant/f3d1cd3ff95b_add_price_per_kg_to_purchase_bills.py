"""add price_per_kg to purchase_bills

Revision ID: f3d1cd3ff95b
Revises: eb298a38e4de
Create Date: 2026-07-29 10:31:47.160186

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3d1cd3ff95b'
down_revision: Union[str, Sequence[str], None] = 'eb298a38e4de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('purchase_bills', sa.Column('price_per_kg', sa.Numeric(precision=10, scale=2), nullable=True))

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('purchase_bills', 'price_per_kg')
