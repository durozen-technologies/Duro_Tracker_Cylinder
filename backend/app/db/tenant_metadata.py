"""Tenant-only SQLAlchemy metadata tools."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from sqlalchemy import Enum as SAEnum
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.engine import Connection


@contextmanager
def _reuse_public_pg_enums(connection: Connection | Any) -> Iterator[None]:
    if connection.dialect.name != "postgresql":
        yield
        return

    from app.db.database import Base

    original_schemas = {}
    for table in Base.metadata.tables.values():
        if table.schema != "tenant":
            continue
        for column in table.columns:
            if isinstance(column.type, SAEnum) and column.type.name:
                original_schemas[column.type.name] = column.type.schema
                column.type.schema = "public"
                if isinstance(column.type.dialect_impl(connection.dialect), PG_ENUM):
                    column.type.create_type = False  # type: ignore[attr-defined]
    try:
        yield
    finally:
        for table in Base.metadata.tables.values():
            if table.schema != "tenant":
                continue
            for column in table.columns:
                if isinstance(column.type, SAEnum) and column.type.name:
                    column.type.schema = original_schemas.get(column.type.name)
                    column.type.create_type = True  # type: ignore[attr-defined]


from sqlalchemy.orm import Session


def create_tenant_schema_and_tables(session: Session, schema_name: str) -> None:
    connection = session.connection()
    from app.db.database import Base
    from app.db.tenant_schema import assert_safe_schema_name

    safe = assert_safe_schema_name(schema_name)
    connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{safe}"'))
    
    # We must explicitly set search_path so Enum types and tables resolve properly
    connection.execute(text(f'SET search_path TO "{safe}", public'))

    with _reuse_public_pg_enums(connection):
        tables = [t for t in Base.metadata.tables.values() if t.schema == "tenant"]
        connection_with_opts = connection.execution_options(schema_translate_map={"tenant": safe})
        Base.metadata.create_all(connection_with_opts, tables=tables)

    # Stamp alembic version for the tenant to HEAD dynamically
    import os
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    alembic_ini_path = os.path.join(backend_dir, "alembic.ini")
    
    alembic_cfg = Config(alembic_ini_path)
    alembic_cfg.set_main_option("version_locations", os.path.join(backend_dir, "migrations", "versions", "tenant"))
    
    script = ScriptDirectory.from_config(alembic_cfg)
    tenant_head = script.get_current_head()

    connection.execute(text(f'CREATE TABLE IF NOT EXISTS "{safe}".alembic_version (version_num VARCHAR(32) NOT NULL, CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))'))
    connection.execute(text(f'INSERT INTO "{safe}".alembic_version (version_num) VALUES (\'{tenant_head}\') ON CONFLICT DO NOTHING'))


def drop_tenant_schema(session: Session, schema_name: str) -> None:
    connection = session.connection()
    from app.db.tenant_schema import assert_safe_schema_name
    safe = assert_safe_schema_name(schema_name)
    connection.execute(text(f'DROP SCHEMA IF EXISTS "{safe}" CASCADE'))
