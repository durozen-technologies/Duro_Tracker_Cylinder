import os
import uuid
from collections.abc import AsyncGenerator

# Override database URL for tests BEFORE importing any app modules
os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:root@localhost:5432/Duro_Tracker_Test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.database import Base
from app.main import app
from app.models import Organization, User
from app.models.enums import UserRole


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(
        str(get_settings().database_url).replace("postgresql://", "postgresql+asyncpg://"),
        echo=False,
    ).execution_options(schema_translate_map={"tenant": "tenant"})
    
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO postgres"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        await conn.execute(text("DROP SCHEMA IF EXISTS tenant CASCADE"))
        await conn.execute(text("CREATE SCHEMA tenant"))
        
        from app.db.tenant_metadata import _reuse_public_pg_enums
        with _reuse_public_pg_enums(conn):
            await conn.run_sync(Base.metadata.create_all)
            
    yield engine
    
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("DROP SCHEMA tenant CASCADE"))
    await engine.dispose()


@pytest_asyncio.fixture
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    TestingSessionLocal = async_sessionmaker(autocommit=False, autoflush=False, bind=db_engine, class_=AsyncSession)
    async with TestingSessionLocal() as session:
        yield session
        await session.rollback() # rollback any test transactions


@pytest_asyncio.fixture
async def client(db) -> AsyncGenerator[AsyncClient, None]:
    from app.auth.dependencies import get_tenant_db
    from app.db.session import get_platform_db
    
    app.dependency_overrides[get_platform_db] = lambda: db
    app.dependency_overrides[get_tenant_db] = lambda: db
    
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
        
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_org(db: AsyncSession) -> Organization:
    org = Organization(name="Test Org")
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


@pytest_asyncio.fixture
async def tenant_admin_token(db: AsyncSession, test_org: Organization) -> str:
    user = User(
        username=f"admin_{uuid.uuid4().hex[:8]}",
        password_hash="fakehash",
        role=UserRole.TENANT_ADMIN,
        organization_id=test_org.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return create_access_token(subject=str(user.id))


@pytest_asyncio.fixture
async def driver_token(db: AsyncSession, test_org: Organization) -> str:
    user = User(
        username=f"driver_{uuid.uuid4().hex[:8]}",
        password_hash="fakehash",
        role=UserRole.DRIVER,
        organization_id=test_org.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return create_access_token(subject=str(user.id))
