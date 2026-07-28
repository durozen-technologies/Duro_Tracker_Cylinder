import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def fix_migrations():
    if not DATABASE_URL:
        print("DATABASE_URL not found in environment.")
        return

    print(f"Connecting to {DATABASE_URL.split('@')[1]}...")
    engine = create_async_engine(DATABASE_URL)
    
    async with engine.begin() as conn:
        # Get all schemas
        result = await conn.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'"))
        schemas = [row[0] for row in result.fetchall()]
        
        print(f"Found {len(schemas)} tenant schemas.")
        
        for schema in schemas:
            try:
                # Update alembic_version from e123456789ab to fcd17703ca13
                update_query = text(f"UPDATE \"{schema}\".alembic_version SET version_num = 'fcd17703ca13' WHERE version_num = 'e123456789ab'")
                res = await conn.execute(update_query)
                if res.rowcount > 0:
                    print(f"✅ Fixed schema {schema}")
                else:
                    print(f"⚡ Schema {schema} did not need fixing.")
            except Exception as e:
                print(f"Error on {schema}: {e}")
                
    await engine.dispose()
    print("Done!")

if __name__ == "__main__":
    asyncio.run(fix_migrations())
