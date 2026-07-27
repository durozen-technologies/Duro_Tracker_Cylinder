#!/bin/sh
set -eu

# Run database migrations
echo "Running database migrations..."
python run_migrations.py

# Execute the command passed to the container
exec "$@"
