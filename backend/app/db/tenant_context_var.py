"""Request-scoped tenant schema for PostgreSQL search_path re-application."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

active_tenant_schema: ContextVar[str | None] = ContextVar("active_tenant_schema", default=None)


def get_active_tenant_schema() -> str | None:
    return active_tenant_schema.get()


def set_active_tenant_schema(schema_name: str | None) -> object:
    return active_tenant_schema.set(schema_name)


def reset_active_tenant_schema(token: Any) -> None:
    try:
        active_tenant_schema.reset(token)
    except ValueError:
        # FastAPI often runs dependency teardown in a different context when an exception occurs.
        # If the context is different, we can't reset with the token.
        active_tenant_schema.set(None)
