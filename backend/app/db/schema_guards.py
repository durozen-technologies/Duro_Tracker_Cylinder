from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from .database import Base

UUID_IDENTIFIER_COLUMNS = {
    "bill_items": {"id", "bill_id", "item_id"},
    "checkout_snapshots": {"id", "shop_id", "bill_id"},
    "bills": {"id", "shop_id", "created_by_user_id"},
    "daily_prices": {"id", "shop_id", "item_id"},
    "expense_entries": {"id", "shop_id", "expense_item_id"},
    "expense_items": {"id"},
    "inventory_categories": {"id"},
    "inventory_item_categories": {"id", "inventory_item_id", "category_id"},
    "inventory_items": {"id"},
    "inventory_movements": {"id", "shop_id", "inventory_item_id", "category_id"},
    "items": {"id"},
    "item_categories": {"id"},
    "item_change_events": {"id", "item_id", "shop_id"},
    "payments": {"id", "bill_id"},
    "receipts": {"id", "bill_id"},
    "shop_expense_allocations": {"id", "shop_id", "expense_item_id"},
    "shop_inventory_allocations": {"id", "shop_id", "inventory_item_id"},
    "shop_item_allocations": {"id", "shop_id", "item_id"},
    "shops": {"id", "owner_user_id"},
    "users": {"id"},
}


def _ensure_indexes(sync_conn: Connection) -> None:
    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            index.create(bind=sync_conn, checkfirst=True)


def _drop_legacy_shop_code_column(sync_conn: Connection) -> None:
    inspector = inspect(sync_conn)
    if "shops" not in set(inspector.get_table_names()):
        return

    column_names = {column["name"] for column in inspector.get_columns("shops")}
    if "code" not in column_names:
        return

    sync_conn.execute(text("ALTER TABLE shops DROP COLUMN code"))


def _ensure_uuid_identifier_columns(sync_conn: Connection) -> None:
    inspector = inspect(sync_conn)
    table_names = set(inspector.get_table_names())
    incompatible_columns: list[str] = []

    for table_name, column_names in UUID_IDENTIFIER_COLUMNS.items():
        if table_name not in table_names:
            continue

        columns = {column["name"]: column["type"] for column in inspector.get_columns(table_name)}
        for column_name in column_names:
            column_type = columns.get(column_name)
            if column_type is None:
                continue

            rendered_type = str(column_type).lower()
            if "uuid" in rendered_type or rendered_type.startswith("char"):
                continue

            incompatible_columns.append(f"{table_name}.{column_name} ({column_type})")

    if incompatible_columns:
        joined_columns = ", ".join(sorted(incompatible_columns))
        raise RuntimeError(
            "Database schema still uses legacy non-UUID identifier columns: "
            f"{joined_columns}. Reset the database or run a manual PK/FK migration to UUIDv7."
        )


def _ensure_item_image_columns(sync_conn: Connection) -> None:
    inspector = inspect(sync_conn)
    if "items" not in set(inspector.get_table_names()):
        return

    column_names = {column["name"] for column in inspector.get_columns("items")}
    if "image_object_key" not in column_names:
        sync_conn.execute(text("ALTER TABLE items ADD COLUMN image_object_key VARCHAR(255)"))
    if "image_content_type" not in column_names:
        sync_conn.execute(text("ALTER TABLE items ADD COLUMN image_content_type VARCHAR(120)"))
    if "image_thumbnail_object_key" not in column_names:
        sync_conn.execute(
            text("ALTER TABLE items ADD COLUMN image_thumbnail_object_key VARCHAR(255)")
        )
    if "image_thumbnail_content_type" not in column_names:
        sync_conn.execute(
            text("ALTER TABLE items ADD COLUMN image_thumbnail_content_type VARCHAR(120)")
        )


def _ensure_item_tamil_name_column(sync_conn: Connection) -> None:
    inspector = inspect(sync_conn)
    if "items" not in set(inspector.get_table_names()):
        return

    column_names = {column["name"] for column in inspector.get_columns("items")}
    if "tamil_name" not in column_names:
        sync_conn.execute(text("ALTER TABLE items ADD COLUMN tamil_name VARCHAR(120)"))


def _ensure_inventory_vehicle_number_column(sync_conn: Connection) -> None:
    """Keep direct app starts compatible with the inventory movement model.

    Alembic is the canonical schema path, but local and manually started
    backends can point at a database that has not been migrated yet. A stale or
    manually narrowed transport column is exactly the kind of drift that turns
    valid vehicle details into bad persisted data, so repair it at startup.
    """
    inspector = inspect(sync_conn)
    if "inventory_movements" not in set(inspector.get_table_names()):
        return

    columns = {
        column["name"]: column["type"] for column in inspector.get_columns("inventory_movements")
    }
    column_type = columns.get("vehicle_number")
    dialect = sync_conn.dialect.name

    if column_type is None:
        if dialect == "postgresql":
            sync_conn.execute(
                text(
                    "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(120)"
                )
            )
        else:
            sync_conn.execute(
                text("ALTER TABLE inventory_movements ADD COLUMN vehicle_number VARCHAR(120)")
            )
        return

    current_length = getattr(column_type, "length", None)
    if current_length is not None and current_length >= 120:
        return

    if dialect == "postgresql":
        sync_conn.execute(
            text("ALTER TABLE inventory_movements ALTER COLUMN vehicle_number TYPE VARCHAR(120)")
        )


