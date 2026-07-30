import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_super_admin
from app.core.security import get_password_hash
from app.db.session import get_platform_db
from app.db.tenant_metadata import create_tenant_schema_and_tables, drop_tenant_schema
from app.db.tenant_schema import build_schema_name
from app.models import Organization, User
from app.models.enums import UserRole
from app.schemas.organization import OrganizationCreate, OrganizationOut, OrganizationUpdate
from app.schemas.user import UserCreate, UserOut, UserUpdate


class SuperAdminStatsOut(BaseModel):
    total_users: int
    total_organizations: int

router = APIRouter(dependencies=[Depends(require_super_admin())])

@router.get("/stats", response_model=SuperAdminStatsOut)
async def get_stats(
    db: AsyncSession = Depends(get_platform_db),
):
    total_orgs = await db.scalar(select(func.count(Organization.id)))
    total_users = await db.scalar(select(func.count(User.id)))
    
    return SuperAdminStatsOut(
        total_users=total_users or 0,
        total_organizations=total_orgs or 0
    )


@router.post("/organizations", response_model=OrganizationOut)
async def create_organization(
    org_in: OrganizationCreate,
    db: AsyncSession = Depends(get_platform_db),
):
    org = Organization(
        name=org_in.name, 
        max_users=org_in.max_users,
        address=org_in.address,
        phone=org_in.phone,
        bill_prefix_sales=org_in.bill_prefix_sales,
        bill_prefix_collection=org_in.bill_prefix_collection
    )
    db.add(org)
    await db.flush()
    
    # Provision the physical schema for this tenant
    schema_name = build_schema_name(org.id)
    try:
        await db.run_sync(create_tenant_schema_and_tables, schema_name)
    except Exception as e:
        await db.rollback()
        await db.run_sync(drop_tenant_schema, schema_name)
        raise HTTPException(status_code=500, detail=f"Failed to provision tenant schema: {str(e)}") from e
        
    await db.commit()
    await db.refresh(org)
    
    return org


@router.get("/organizations", response_model=list[OrganizationOut])
async def list_organizations(
    db: AsyncSession = Depends(get_platform_db),
):
    result = await db.scalars(select(Organization))
    return result.all()

@router.put("/organizations/{org_id}", response_model=OrganizationOut)
async def update_organization(
    org_id: uuid.UUID,
    org_in: OrganizationUpdate,
    db: AsyncSession = Depends(get_platform_db),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
        
    if org_in.name is not None:
        org.name = org_in.name
    if org_in.max_users is not None:
        org.max_users = org_in.max_users
    if org_in.address is not None:
        org.address = org_in.address
    if org_in.phone is not None:
        org.phone = org_in.phone
    if org_in.bill_prefix_sales is not None:
        org.bill_prefix_sales = org_in.bill_prefix_sales
    if org_in.bill_prefix_collection is not None:
        org.bill_prefix_collection = org_in.bill_prefix_collection
        
    await db.commit()
    await db.refresh(org)
    return org

@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_platform_db),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
        
    schema_name = build_schema_name(org_id)
    # Drop schema in a sync wrapper since connection.execute is sync
    await db.run_sync(drop_tenant_schema, schema_name)
    
    # Delete the organization which cascades to users in platform db
    await db.delete(org)
    await db.commit()
    return None

@router.get("/organizations/{org_id}/users", response_model=list[UserOut])
async def list_organization_users(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_platform_db),
):
    result = await db.scalars(select(User).where(User.organization_id == org_id))
    return result.all()



@router.post("/organizations/{org_id}/admins", response_model=UserOut)
async def create_tenant_admin(
    org_id: uuid.UUID,
    user_in: UserCreate,
    db: AsyncSession = Depends(get_platform_db),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check user limit
    user_count = await db.scalar(select(func.count(User.id)).where(User.organization_id == org_id))
    if user_count and user_count >= org.max_users:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="USER_LIMIT_REACHED")

    user = User(
        username=user_in.username,
        password_hash=get_password_hash(user_in.password),
        role=UserRole.TENANT_ADMIN,
        organization_id=org_id,
        is_active=user_in.is_active,
    )
    db.add(user)
    
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if "uq_users_username" in str(e.orig):
            raise HTTPException(status_code=400, detail="Username is already taken globally")
        raise e

    await db.refresh(user)
    return user

@router.put("/organizations/{org_id}/users/{user_id}", response_model=UserOut)
async def update_organization_user(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    user_in: UserUpdate,
    db: AsyncSession = Depends(get_platform_db),
):
    user = await db.get(User, user_id)
    if not user or user.organization_id != org_id:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user_in.password:
        user.password_hash = get_password_hash(user_in.password)
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
        
    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/organizations/{org_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization_user(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_platform_db),
):
    user = await db.get(User, user_id)
    if not user or user.organization_id != org_id:
        raise HTTPException(status_code=404, detail="User not found")
        
    await db.delete(user)
    await db.commit()
    return None
