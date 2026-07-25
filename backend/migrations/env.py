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
from app.db.database import Base
import app.models  # noqa: F401

target_metadata = Base.metadata

def include_object_public(object, name, type_, reflected, compare_to):
    if type_ == "table" and name == "spatial_ref_sys":
        return False
    # Only include objects that are NOT in the 'tenant' schema
    if getattr(object, "schema", None) == "tenant":
        return False
    return True

def include_object_tenant(object, name, type_, reflected, compare_to):
    # Only include objects that ARE in the 'tenant' schema
    if getattr(object, "schema", None) != "tenant":
        return False
    return True

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
        tenant_conn = connection.execution_options(schema_translate_map={"tenant": "public"})
        context.configure(
            connection=tenant_conn, 
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=False,
            include_object=include_object_tenant,
            schema_translate_map={"tenant": "public"},
            version_locations=[tenant_version_loc],
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
                version_locations=[public_version_loc, tenant_version_loc],
            )
            with context.begin_transaction():
                context.run_migrations()


async def run_async_migrations() -> None:
    from sqlalchemy import text

    from app.core.config import Settings
    from app.db.tenant_schema import build_schema_name
    
    settings = Settings()
    
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = settings.database_url
    
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        # Query active tenants (check if table exists to avoid aborting the transaction)
        tenant_schemas = []
        if await connection.run_sync(lambda sync_conn: sync_conn.dialect.has_table(sync_conn, "organizations")):
            result = await connection.execute(text("SELECT id FROM organizations"))
            tenant_schemas = [build_schema_name(row[0]) for row in result.fetchall()]
        
        await connection.run_sync(do_run_migrations, tenant_schemas)
        await connection.commit()

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


def run_migrations_offline() -> None:
    print("Offline migrations are not supported for multi-tenant configurations.")
    import sys
    sys.exit(1)

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
