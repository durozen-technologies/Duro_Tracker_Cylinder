"""Schema-per-tenant provisioning and search_path routing."""

import logging
import re
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tenant_context_var import (
    reset_active_tenant_schema,
    set_active_tenant_schema,
)

logger = logging.getLogger(__name__)

_SCHEMA_PREFIX = "tenant_"
_MAX_SCHEMA_LEN = 63
_SAFE_SCHEMA_RE = re.compile(r"^tenant_[a-f0-9]{32}$")

def assert_safe_schema_name(schema_name: str) -> str:
    if not schema_name or len(schema_name) > _MAX_SCHEMA_LEN:
        raise ValueError(f"Schema name must be 1-{_MAX_SCHEMA_LEN} chars.")
    if not _SAFE_SCHEMA_RE.match(schema_name):
        raise ValueError("Schema name must match ^tenant_[a-f0-9]{32}$")
    return schema_name


def build_schema_name(organization_id: UUID) -> str:
    return f"{_SCHEMA_PREFIX}{organization_id.hex}"


async def set_search_path(session: AsyncSession, schema_name: str | None) -> None:
    if schema_name:
        safe = assert_safe_schema_name(schema_name)
        await session.execute(text(f'SET search_path TO "{safe}", public'))
    else:
        await session.execute(text("SET search_path TO public"))


@asynccontextmanager
async def tenant_schema_scope(
    session: AsyncSession, schema_name: str | None
) -> AsyncGenerator[None, None]:
    token = set_active_tenant_schema(schema_name)
    try:
        await set_search_path(session, schema_name)
        yield
    finally:
        reset_active_tenant_schema(token)
        await set_search_path(session, None)


class TenantRouter:
    """A simple router that resolves organization_id to schema names."""
    
    async def resolve_schema(self, db: AsyncSession, organization_id: UUID) -> str | None:
        from app.models.organization import Organization
        org = await db.get(Organization, organization_id)
        if not org:
            return None
        return build_schema_name(organization_id)

tenant_router = TenantRouter()
