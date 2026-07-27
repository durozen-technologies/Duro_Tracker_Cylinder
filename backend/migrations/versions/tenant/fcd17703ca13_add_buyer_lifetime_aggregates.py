"""add buyer lifetime aggregates

Revision ID: fcd17703ca13
Revises: 5b66fea9316a
Create Date: 2026-07-27 15:51:26.733291

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fcd17703ca13'
down_revision: Union[str, Sequence[str], None] = '5b66fea9316a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns with a default value of 0 to avoid breaking existing data
    op.add_column('buyers', sa.Column('total_lifetime_sales', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'), schema='tenant')
    op.add_column('buyers', sa.Column('total_lifetime_paid', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'), schema='tenant')


def downgrade() -> None:
    op.drop_column('buyers', 'total_lifetime_paid', schema='tenant')
    op.drop_column('buyers', 'total_lifetime_sales', schema='tenant')
