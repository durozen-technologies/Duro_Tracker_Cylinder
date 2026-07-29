"""remove category

Revision ID: 109347070dbc
Revises: 15ef8eb6caee
Create Date: 2026-07-26 16:44:51.044953

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '109347070dbc'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TABLE items DROP COLUMN IF EXISTS category;")


def downgrade() -> None:
    """Downgrade schema."""
    pass
