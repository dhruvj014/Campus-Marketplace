#!/bin/sh
set -e

echo "Waiting for database to be ready..."
sleep 5

echo "Starting application..."
# Use PORT environment variable from Cloud Run, default to 8000 for local development
PORT=${PORT:-8000}
uvicorn main:app --host 0.0.0.0 --port $PORT &
APP_PID=$!

# Wait a bit for tables to be created
sleep 10

echo "Creating admin user..."
python create_admin.py || echo "Admin creation skipped or failed"

# Wait for the app process
wait $APP_PID
