import logging

from .database import get_engine
from .schema_guards import (
    _ensure_inventory_vehicle_number_column,
    _ensure_item_image_columns,
    _ensure_uuid_identifier_columns,
)

logger = logging.getLogger(__name__)


async def initialize_database() -> None:
    await run_database_startup_tasks()


async def migrate_legacy_item_images_before_schema_changes() -> None:
    pass


async def run_database_startup_tasks() -> None:
    from .. import models as _models  # noqa: F401

    async with get_engine().begin() as conn:
        await conn.run_sync(_ensure_inventory_vehicle_number_column)
        await conn.run_sync(_ensure_item_image_columns)
        await conn.run_sync(_ensure_uuid_identifier_columns)

