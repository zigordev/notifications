#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $0 \
    --release-dir <path> \
    --region <aws-region> \
    --app-ssm-prefix </notifications/prod/app> \
    --api-image <ecr-uri:tag> \
    --release-tag <tag>
USAGE
}

RELEASE_DIR=""
AWS_REGION=""
APP_SSM_PREFIX=""
API_IMAGE=""
RELEASE_TAG=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-dir) RELEASE_DIR="$2"; shift 2 ;;
    --region) AWS_REGION="$2"; shift 2 ;;
    --app-ssm-prefix) APP_SSM_PREFIX="$2"; shift 2 ;;
    --api-image) API_IMAGE="$2"; shift 2 ;;
    --release-tag) RELEASE_TAG="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

for cmd in aws jq docker curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing command: $cmd" >&2; exit 1; }
done

[ -n "$RELEASE_DIR" ] || { echo "Missing --release-dir" >&2; exit 1; }
[ -n "$AWS_REGION" ] || { echo "Missing --region" >&2; exit 1; }
[ -n "$APP_SSM_PREFIX" ] || { echo "Missing --app-ssm-prefix" >&2; exit 1; }
[ -n "$API_IMAGE" ] || { echo "Missing --api-image" >&2; exit 1; }
[ -n "$RELEASE_TAG" ] || { echo "Missing --release-tag" >&2; exit 1; }
[ -d "$RELEASE_DIR" ] || { echo "Release dir not found: $RELEASE_DIR" >&2; exit 1; }

cd "$RELEASE_DIR"

APP_BASE_ENV_FILE="docker/.env.app.prod"
APP_ENV_FILE="$(mktemp /tmp/notifications-app-env.XXXXXX)"
trap 'rm -f "$APP_ENV_FILE"' EXIT
OPENBAO_LOCAL_ADDR="http://127.0.0.1:8200"
OPENBAO_KV_MOUNT="kv"
OPENBAO_SECRET_PATH="notifications"

cp "$APP_BASE_ENV_FILE" "$APP_ENV_FILE"
chmod 600 "$APP_ENV_FILE"

read_env_var() {
  local file="$1"
  local key="$2"
  grep -E "^${key}=" "$file" | tail -n1 | cut -d'=' -f2- || true
}

require_env_var_in_file() {
  local file="$1"
  local key="$2"
  local value
  value="$(read_env_var "$file" "$key")"
  if [ -z "$value" ]; then
    echo "Missing required non-secret value '$key' in $file" >&2
    exit 1
  fi
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" -F= '
    BEGIN { updated=0 }
    $1 == key { print key "=" value; updated=1; next }
    { print }
    END { if (!updated) print key "=" value }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

fetch_ssm_secret_value() {
  local parameter_name="$1"
  aws ssm get-parameter \
    --region "$AWS_REGION" \
    --name "$parameter_name" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text
}

required_non_secret_keys=(
  TRUST_PROXY
  OTEL_EXPORTER_OTLP_ENDPOINT
  KAFKA_BOOTSTRAP_SERVERS
  NOTIFICATIONS_EMAIL_TOPIC
  NOTIFICATIONS_EMAIL_DLT_TOPIC
  SMTP_HOST
  SMTP_PORT
  SMTP_USER
  SMTP_FROM
  SMTP_STARTTLS
)

for key in "${required_non_secret_keys[@]}"; do
  require_env_var_in_file "$APP_ENV_FILE" "$key"
done

openbao_token="$(fetch_ssm_secret_value "${APP_SSM_PREFIX%/}/OPENBAO_TOKEN")"
upsert_env_var "$APP_ENV_FILE" "OPENBAO_TOKEN" "$openbao_token"
upsert_env_var "$APP_ENV_FILE" "API_IMAGE" "$API_IMAGE"

docker network create "platform_ops_shared" >/dev/null 2>&1 || true

openbao_code=""
for i in $(seq 1 60); do
  openbao_code="$(curl -s -o /dev/null -w '%{http_code}' "$OPENBAO_LOCAL_ADDR/v1/sys/health" || true)"
  if [ "$openbao_code" = "200" ] || [ "$openbao_code" = "429" ]; then
    break
  fi
  sleep 2
done

if [ "$openbao_code" != "200" ] && [ "$openbao_code" != "429" ]; then
  echo "OpenBao did not become ready (last_health_code=$openbao_code)." >&2
  exit 1
fi

openbao_secret_url="${OPENBAO_LOCAL_ADDR}/v1/${OPENBAO_KV_MOUNT}/data/${OPENBAO_SECRET_PATH}"
openbao_secret_body_file="$(mktemp)"
openbao_secret_code="$(curl -s -o "$openbao_secret_body_file" -w '%{http_code}' -H "X-Vault-Token: $openbao_token" "$openbao_secret_url" || true)"
if [ "$openbao_secret_code" != "200" ]; then
  echo "Failed to read OpenBao secret ${OPENBAO_KV_MOUNT}/${OPENBAO_SECRET_PATH}" >&2
  cat "$openbao_secret_body_file" >&2 || true
  rm -f "$openbao_secret_body_file"
  exit 1
fi

postgres_password="$(jq -r '.data.data.POSTGRES_PASSWORD // ""' "$openbao_secret_body_file")"
rm -f "$openbao_secret_body_file"
if [ -z "$postgres_password" ]; then
  echo "OpenBao secret path is missing required key: POSTGRES_PASSWORD" >&2
  exit 1
fi
upsert_env_var "$APP_ENV_FILE" "POSTGRES_PASSWORD" "$postgres_password"

docker compose --env-file "$APP_ENV_FILE" -f docker/compose.app.prod.yml up -d --remove-orphans
