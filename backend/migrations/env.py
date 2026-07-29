import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
import app.models  # noqa: F401
from app.db.database import Base

target_metadata = Base.metadata

def include_object_public(object, name, type_, reflected, compare_to):
    if type_ == "table" and name in ("spatial_ref_sys", "alembic_version"):
        return False
    # Only include objects that are NOT in the 'tenant' schema
    if getattr(object, "schema", None) == "tenant":
        return False
    return True

def include_object_tenant(object, name, type_, reflected, compare_to):
    if type_ == "table" and name == "alembic_version":
        return False
    # Only include objects that ARE in the 'tenant' schema
    if getattr(object, "schema", None) != "tenant":
        return False
    return True

def render_item(type_, obj, autogen_context):
    """Strip schema='tenant' during autogeneration so it doesn't hardcode it into the migration file"""
    if type_ == "table_schema" and obj.schema == "tenant":
        return False
    
    # Let Alembic render everything else normally
    return False

def do_run_migrations(connection: Connection, tenant_schemas: list[str]) -> None:
    import os
    alembic_mode = os.environ.get("ALEMBIC_MODE", "upgrade")
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public_version_loc = os.path.join(base_dir, "migrations", "versions", "public")
    tenant_version_loc = os.path.join(base_dir, "migrations", "versions", "tenant")
    
    if alembic_mode == "public":
        from sqlalchemy import text
        connection.execute(text('SET search_path TO "public"'))
        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=False,
            include_object=include_object_public,
            version_table_schema="public",
            version_locations=[public_version_loc],
        )
        with context.begin_transaction():
            context.run_migrations()
    elif alembic_mode == "tenant":
        # For autogenerating tenant migrations, use an active tenant schema if possible
        # so Alembic reads the correct alembic_version table
        from sqlalchemy import text
        tenant_schema = "public"
        result = connection.execute(text("SELECT id FROM public.organizations LIMIT 1")).scalar()
        if result:
            from app.db.tenant_schema import build_schema_name
            tenant_schema = build_schema_name(result)
        
        tenant_conn = connection.execution_options(schema_translate_map={"tenant": tenant_schema})
        tenant_conn.execute(text(f'SET search_path TO "{tenant_schema}"'))
        
        context.configure(
            connection=tenant_conn, 
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=False,
            include_object=include_object_tenant,
            schema_translate_map={"tenant": tenant_schema},
            version_locations=[tenant_version_loc],
            version_table_schema=tenant_schema if tenant_schema != "public" else None,
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()
    elif alembic_mode == "tenant_upgrade":
        schema_name = os.environ.get("CURRENT_TENANT")
        tenant_conn = connection.execution_options(schema_translate_map={"tenant": schema_name})
        from sqlalchemy import text
        tenant_conn.execute(text(f'SET search_path TO "{schema_name}"'))
        context.configure(
            connection=tenant_conn, 
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=False,
            include_object=include_object_tenant,
            version_table_schema=schema_name,
            schema_translate_map={"tenant": schema_name},
            version_locations=[tenant_version_loc],
        )
        with context.begin_transaction():
            context.run_migrations()
    else:
        # 1. Run migrations for the public schema
        os.environ["ALEMBIC_MODE"] = "public"
        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=False,
            include_object=include_object_public,
            version_table_schema="public",
            version_locations=[public_version_loc],
        )
        with context.begin_transaction():
            context.run_migrations()

        # 2. Run migrations for each active tenant schema
        os.environ["ALEMBIC_MODE"] = "tenant"
        for schema_name in tenant_schemas:
            print(f"Migrating tenant schema: {schema_name}")
            tenant_conn = connection.execution_options(schema_translate_map={"tenant": schema_name})
            from sqlalchemy import text
            tenant_conn.execute(text(f'SET search_path TO "{schema_name}"'))
            
            context.configure(
                connection=tenant_conn, 
                target_metadata=target_metadata,
                compare_type=True,
                include_schemas=False,
                include_object=include_object_tenant,
                version_table_schema=schema_name,
                schema_translate_map={"tenant": schema_name},
                version_locations=[tenant_version_loc],
            )
            with context.begin_transaction():
                context.run_migrations()


def run_migrations_online() -> None:
    from sqlalchemy import text, engine_from_config
    from app.core.config import Settings
    from app.db.tenant_schema import build_schema_name
    
    settings = Settings()
    
    configuration = config.get_section(config.config_ini_section, {})
    # Strip +asyncpg to use the synchronous psycopg2 driver for migrations
    configuration["sqlalchemy.url"] = settings.database_url.replace("+asyncpg", "")
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Query active tenants (check if table exists to avoid aborting the transaction)
        tenant_schemas = []
        if connection.dialect.has_table(connection, "organizations"):
            result = connection.execute(text("SELECT id FROM organizations"))
            tenant_schemas = [build_schema_name(row[0]) for row in result.fetchall()]
        
        do_run_migrations(connection, tenant_schemas)
        connection.commit()


def run_migrations_offline() -> None:
    print("Offline migrations are not supported for multi-tenant configurations.")
    import sys
    sys.exit(1)

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
