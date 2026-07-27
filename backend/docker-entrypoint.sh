#!/bin/sh
set -eu

# Wait for database to be ready
echo "Waiting for database to be ready..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if python -c "
import asyncio
from app.core.config import Settings
from sqlalchemy import create_engine, text

settings = Settings()
db_url = settings.database_url.replace('+asyncpg', '')
try:
    engine = create_engine(db_url, echo=False, pool_pre_ping=True)
    with engine.connect() as conn:
        conn.execute(text('SELECT 1'))
    print('Database is ready!')
    exit(0)
except Exception as e:
    print(f'Database not ready: {e}')
    exit(1)
" 2>/dev/null; then
        break
    fi
    echo "Database not ready, attempt $attempt/$max_attempts. Retrying in 2 seconds..."
    attempt=$((attempt + 1))
    sleep 2
done

if [ $attempt -gt $max_attempts ]; then
    echo "Failed to connect to database after $max_attempts attempts"
    exit 1
fi

# Run database migrations
echo "Running database migrations..."
python run_migrations.py

# Execute the command passed to the container
exec "$@"
