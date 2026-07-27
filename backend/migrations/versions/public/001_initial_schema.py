"""Initial schema creation

Revision ID: 001_initial
Revises: 
Create Date: 2026-07-27 17:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial'
down_revision = None
branch_labels = ('public',)
depends_on = None


def upgrade() -> None:
    # Create ENUM types
    op.execute("CREATE TYPE userrole AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DRIVER', 'USER')")
    op.execute("CREATE TYPE buyertype AS ENUM ('INDIVIDUAL', 'BUSINESS', 'CORPORATE')")
    op.execute("CREATE TYPE deliverybillstatus AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')")
    op.execute("CREATE TYPE itemcategory AS ENUM ('ELECTRONICS', 'CLOTHING', 'FOOD', 'OTHER')")
    
    # Create organizations table
    op.create_table(
        'organizations',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_organizations_name', 'name'),
        sa.Index('ix_organizations_is_active', 'is_active')
    )
    
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.Enum('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DRIVER', 'USER', name='userrole'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_users_username', sa.func.lower(sa.column('username')), unique=True),
        sa.Index('ix_users_org_role_active', 'organization_id', 'role', 'is_active')
    )
    
    # Create buyers table
    op.create_table(
        'buyers',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('address', sa.String(length=255), nullable=True),
        sa.Column('buyer_type', sa.Enum('INDIVIDUAL', 'BUSINESS', 'CORPORATE', name='buyertype'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_buyers_organization_id', 'organization_id'),
        sa.Index('ix_buyers_email', 'email')
    )
    
    # Create delivery_bills table
    op.create_table(
        'delivery_bills',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('bill_number', sa.String(length=50), nullable=False),
        sa.Column('buyer_id', postgresql.UUID(), nullable=False),
        sa.Column('driver_id', postgresql.UUID(), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', name='deliverybillstatus'), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('organization_id', postgresql.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['buyer_id'], ['buyers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['driver_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_delivery_bills_organization_id', 'organization_id'),
        sa.Index('ix_delivery_bills_buyer_id', 'buyer_id'),
        sa.Index('ix_delivery_bills_driver_id', 'driver_id'),
        sa.Index('ix_delivery_bills_status', 'status')
    )
    
    # Create items table
    op.create_table(
        'items',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('sku', sa.String(length=50), nullable=False),
        sa.Column('category', sa.Enum('ELECTRONICS', 'CLOTHING', 'FOOD', 'OTHER', name='itemcategory'), nullable=False),
        sa.Column('price', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('quantity_in_stock', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('organization_id', postgresql.UUID(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_items_organization_id', 'organization_id'),
        sa.Index('ix_items_sku', 'sku')
    )
    
    # Create delivery_bill_items junction table
    op.create_table(
        'delivery_bill_items',
        sa.Column('delivery_bill_id', postgresql.UUID(), nullable=False),
        sa.Column('item_id', postgresql.UUID(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['delivery_bill_id'], ['delivery_bills.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('delivery_bill_id', 'item_id'),
        sa.Index('ix_delivery_bill_items_item_id', 'item_id')
    )


def downgrade() -> None:
    op.drop_table('delivery_bill_items')
    op.drop_table('items')
    op.drop_table('delivery_bills')
    op.drop_table('buyers')
    op.drop_table('users')
    op.drop_table('organizations')
    
    op.execute("DROP TYPE itemcategory")
    op.execute("DROP TYPE deliverybillstatus")
    op.execute("DROP TYPE buyertype")
    op.execute("DROP TYPE userrole")
