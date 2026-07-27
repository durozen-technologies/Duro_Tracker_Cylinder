"""Add org settings

Revision ID: 15ef8eb6caee
Revises: e73b477a6537
Create Date: 2026-07-25 15:09:21.132101

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '15ef8eb6caee'
down_revision: Union[str, Sequence[str], None] = 'e73b477a6537'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('organizations', sa.Column('address', sa.String(length=1000), nullable=True))
    op.add_column('organizations', sa.Column('phone', sa.String(length=20), nullable=True))
    op.add_column('organizations', sa.Column('bill_prefix_sales', sa.String(length=20), server_default="SHA", nullable=False))
    op.add_column('organizations', sa.Column('bill_prefix_collection', sa.String(length=20), server_default="PAY", nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('organizations', 'bill_prefix_collection')
    op.drop_column('organizations', 'bill_prefix_sales')
    op.drop_column('organizations', 'phone')
    op.drop_column('organizations', 'address')
    # ### end Alembic commands ###
