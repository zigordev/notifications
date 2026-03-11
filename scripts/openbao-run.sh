#!/usr/bin/env sh
set -eu

normalize() {
  value="$(printf '%s' "${1:-}" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  printf '%s' "$value"
}

die() {
  echo "$1" >&2
  exit 1
}

fetch_secrets() {
  addr="$(normalize "${OPENBAO_ADDR:-}")"
  token="$(normalize "${OPENBAO_TOKEN:-}")"
  mount="$(normalize "${OPENBAO_KV_MOUNT:-}")"
  path="$(normalize "${OPENBAO_SECRET_PATH:-}")"

  [ -n "$addr" ] || die "OPENBAO_ADDR is required"
  [ -n "$token" ] || die "OPENBAO_TOKEN is required"
  [ -n "$mount" ] || die "OPENBAO_KV_MOUNT is required"
  [ -n "$path" ] || die "OPENBAO_SECRET_PATH is required"

  url="${addr%/}/v1/${mount#/}/data/${path#/}"
  attempts=45
  i=1

  while [ "$i" -le "$attempts" ]; do
    body_file="$(mktemp)"
    code="$(curl -sS -o "$body_file" -w '%{http_code}' -H "X-Vault-Token: $token" "$url" || true)"
    if [ "$code" = "200" ]; then
      jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"' "$body_file"
      rm -f "$body_file"
      return 0
    fi
    rm -f "$body_file"
    if [ "$i" -lt "$attempts" ]; then
      sleep 2
    fi
    i=$((i + 1))
  done

  die "Failed to fetch OpenBao secrets from ${mount}/${path}"
}

required_keys="$(normalize "${OPENBAO_REQUIRED_KEYS:-}")"
[ -n "$required_keys" ] || die "OPENBAO_REQUIRED_KEYS is required"

secret_lines="$(fetch_secrets)"

OLD_IFS="$IFS"
IFS='
'
for line in $secret_lines; do
  key="${line%%=*}"
  value="${line#*=}"
  export "$key=$value"
done
IFS="$OLD_IFS"

OLD_IFS="$IFS"
IFS=','
for key in $required_keys; do
  trimmed="$(normalize "$key")"
  [ -n "$trimmed" ] || continue
  eval "value=\${$trimmed:-}"
  [ -n "$(normalize "$value")" ] || die "OpenBao secret path is missing required key: $trimmed"
done
IFS="$OLD_IFS"

[ "$#" -gt 0 ] || die "No command provided to openbao-run.sh"
exec "$@"
