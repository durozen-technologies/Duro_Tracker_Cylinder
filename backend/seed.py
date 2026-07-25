import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.organization import Organization
from app.models.user import User


async def main():
    engine = create_async_engine("postgresql+asyncpg://postgres:root@localhost:5432/Duro_Tracker")
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        # Check superadmin
        super_admin = await session.execute(select(User).where(User.username == "superadmin"))
        super_admin = super_admin.scalar_one_or_none()
        
        if not super_admin:
            print("Creating superadmin...")
            super_admin = User(
                username="superadmin",
                password_hash=get_password_hash("password123"),
                role=UserRole.SUPER_ADMIN,
                is_active=True
            )
            session.add(super_admin)
            await session.commit()
            print("Superadmin created with username 'superadmin' and password 'password123'")
            
        # Check org
        org = await session.execute(select(Organization).where(Organization.name == "Duro Demo Org"))
        org = org.scalar_one_or_none()
        
        if not org:
            print("Creating Demo Organization...")
            org = Organization(name="Duro Demo Org")
            session.add(org)
            await session.commit()
            
            from app.db.tenant_metadata import create_tenant_schema_and_tables
            from app.db.tenant_schema import build_schema_name
            schema_name = build_schema_name(org.id)
            await session.run_sync(create_tenant_schema_and_tables, schema_name)
            
            print("Creating tenant admin...")
            tenant_admin = User(
                username="admin",
                password_hash=get_password_hash("password123"),
                role=UserRole.TENANT_ADMIN,
                organization_id=org.id,
                is_active=True
            )
            session.add(tenant_admin)
            await session.commit()
            print("Tenant admin created with username 'admin' and password 'password123'")

        # Check driver
        driver = await session.execute(select(User).where(User.username == "driver1"))
        driver = driver.scalar_one_or_none()
        
        if not driver and org:
            print("Creating test driver...")
            driver = User(
                username="driver1",
                password_hash=get_password_hash("password123"),
                role=UserRole.DRIVER,
                organization_id=org.id,
                is_active=True
            )
            session.add(driver)
            await session.commit()
            print("Driver created with username 'driver1' and password 'password123'")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
