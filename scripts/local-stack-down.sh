#!/usr/bin/env bash
set -euo pipefail

APP_ENV_FILE="docker/.env.app.local"
APP_ENV_EXAMPLE_FILE="docker/.env.app.local.example"

if [ ! -f "$APP_ENV_FILE" ]; then
  if [ -f "$APP_ENV_EXAMPLE_FILE" ]; then
    APP_ENV_FILE="$APP_ENV_EXAMPLE_FILE"
  else
    echo "Missing $APP_ENV_FILE. Copy $APP_ENV_EXAMPLE_FILE first." >&2
    exit 1
  fi
fi

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-unused-for-down}" \
  docker compose --env-file "$APP_ENV_FILE" -f docker/compose.app.local.yml down
