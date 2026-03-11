#!/usr/bin/env bash
set -euo pipefail

APP_ENV_FILE="docker/.env.app.local"

if [ ! -f "$APP_ENV_FILE" ]; then
  echo "Missing $APP_ENV_FILE. Copy docker/.env.app.local.example first." >&2
  exit 1
fi

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-unused-for-reset}" \
  docker compose --env-file "$APP_ENV_FILE" -f docker/compose.app.local.yml down -v --rmi local --remove-orphans
