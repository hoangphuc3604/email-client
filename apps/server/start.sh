#!/usr/bin/env bash
# Use PORT environment variable if set, otherwise default to 8000
PORT=${PORT:-8000}

echo "Starting server on port $PORT..."

# Start uvicorn server
uvicorn app.main:app --host 0.0.0.0 --port $PORT
