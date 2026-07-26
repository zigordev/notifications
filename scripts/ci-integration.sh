#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker/compose.ci.yml)

cleanup() {
  "${compose[@]}" down -v --remove-orphans
}
trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for $label at $url" >&2
  "${compose[@]}" logs --no-color
  return 1
}

sql_value() {
  local query="$1"
  "${compose[@]}" exec -T postgres \
    psql -U notifications_admin -d notifications -tAc "$query" \
    | tr -d '[:space:]'
}

mail_count() {
  curl -fsS http://localhost:18025/api/v1/messages \
    | node -e '
let body = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { body += chunk; });
process.stdin.on("end", () => {
  const response = JSON.parse(body);
  process.stdout.write(String(response.total ?? response.messages?.length ?? 0));
});
'
}

echo "[integration] Starting PostgreSQL, Redpanda, two API consumers, and Mailpit"
"${compose[@]}" up -d --build

wait_for_url "http://localhost:18080/health/readiness" "notifications readiness"
for _ in $(seq 1 60); do
  if "${compose[@]}" exec -T api-peer \
    curl -fsS http://127.0.0.1:8080/health/readiness >/dev/null; then
    break
  fi
  sleep 2
done
"${compose[@]}" exec -T api-peer \
  curl -fsS http://127.0.0.1:8080/health/readiness >/dev/null

metrics="$(curl -fsS http://localhost:18080/metrics)"
grep -q 'process_resident_memory_bytes' <<<"$metrics"
grep -q 'notifications_received_total' <<<"$metrics"

migration_versions="$(sql_value \
  "SELECT string_agg(version, ',' ORDER BY installed_rank) FROM flyway_schema_history WHERE success")"
if [ "$migration_versions" != "1,2" ]; then
  echo "Expected successful Flyway-compatible migrations 1,2; got '$migration_versions'" >&2
  exit 1
fi

payload_one='{"messageId":"concurrent-message-1","idempotencyKey":"concurrent-invitation-1","sourceApp":"gpool","channel":"email","templateId":"gpool.pool-invitation","recipient":{"email":"user@example.com"},"data":{"locale":"en","poolName":"Concurrent Pool","poolId":"ci-pool","inviterEmail":"admin@example.com","acceptUrl":"https://example.com/pools/ci-pool/accept","poolUrl":"https://example.com/pools/ci-pool","frontendUrl":"https://example.com"},"metadata":{"eventType":"user_invited_to_pool"},"requestedAt":"2026-03-11T00:00:00Z"}'
payload_two='{"messageId":"concurrent-message-2","idempotencyKey":"concurrent-invitation-1","sourceApp":"gpool","channel":"email","templateId":"gpool.pool-invitation","recipient":{"email":"user@example.com"},"data":{"locale":"en","poolName":"Concurrent Pool","poolId":"ci-pool","inviterEmail":"admin@example.com","acceptUrl":"https://example.com/pools/ci-pool/accept","poolUrl":"https://example.com/pools/ci-pool","frontendUrl":"https://example.com"},"metadata":{"eventType":"user_invited_to_pool"},"requestedAt":"2026-03-11T00:00:00Z"}'

echo "[integration] Publishing the same idempotency key to two partitions"
printf '%s\n' "$payload_one" \
  | "${compose[@]}" exec -T redpanda \
    rpk topic produce notification.email.requested.v1 --partition 0 -k concurrent-0
printf '%s\n' "$payload_two" \
  | "${compose[@]}" exec -T redpanda \
    rpk topic produce notification.email.requested.v1 --partition 1 -k concurrent-1

for _ in $(seq 1 60); do
  if [ "$(sql_value \
    "SELECT count(*) FROM notification_requests WHERE idempotency_key = 'concurrent-invitation-1' AND status = 'sent'")" = "1" ]; then
    break
  fi
  sleep 2
done

sleep 4
request_count="$(sql_value \
  "SELECT count(*) FROM notification_requests WHERE idempotency_key = 'concurrent-invitation-1'")"
sent_attempt_count="$(sql_value \
  "SELECT count(*) FROM notification_attempts WHERE request_id IN (SELECT request_id FROM notification_requests WHERE idempotency_key = 'concurrent-invitation-1') AND status = 'sent'")"
delivered_mail_count="$(mail_count)"
if [ "$request_count" != "1" ] || [ "$sent_attempt_count" != "1" ] || [ "$delivered_mail_count" != "1" ]; then
  echo "Concurrent idempotency failure: requests=$request_count sent_attempts=$sent_attempt_count mail=$delivered_mail_count" >&2
  "${compose[@]}" logs --no-color api api-peer
  exit 1
fi

recovery_payload='{"messageId":"recovery-redelivery","idempotencyKey":"crashed-worker-invitation","sourceApp":"kini","channel":"email","templateId":"kini.team-invitation","recipient":{"email":"recover@example.com"},"data":{"locale":"en","teamName":"Recovery Team","inviterName":"Taylor","inviterEmail":"taylor@example.com","acceptUrl":"https://example.com/teams/recovery/accept","frontendUrl":"https://example.com"},"metadata":{"eventType":"team_invitation"},"requestedAt":"2026-03-11T00:00:00Z"}'

echo "[integration] Simulating claim, worker crash, and Kafka redelivery"
"${compose[@]}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U notifications_admin -d notifications -c \
  "INSERT INTO notification_requests (
     request_id, idempotency_key, topic, source_app, channel, template_id,
     recipient_email, payload_json, status, processing_owner, processing_started_at
   ) VALUES (
     'recovery-original', 'crashed-worker-invitation', 'notification.email.requested.v1',
     'kini', 'email', 'kini.team-invitation', 'recover@example.com',
     '$recovery_payload'::jsonb, 'processing', 'crashed-worker', NOW()
   )" >/dev/null
printf '%s\n' "$recovery_payload" \
  | "${compose[@]}" exec -T redpanda \
    rpk topic produce notification.email.requested.v1 --partition 0 -k recovery-redelivery

for _ in $(seq 1 30); do
  if [ "$(sql_value \
    "SELECT count(*) FROM notification_requests WHERE request_id = 'recovery-original' AND status = 'sent'")" = "1" ]; then
    break
  fi
  sleep 1
done

recovery_sent_count="$(sql_value \
  "SELECT count(*) FROM notification_attempts WHERE request_id = 'recovery-original' AND status = 'sent'")"
recovery_mail_count="$(mail_count)"
if [ "$recovery_sent_count" != "1" ] || [ "$recovery_mail_count" != "2" ]; then
  echo "Lease recovery failure: sent_attempts=$recovery_sent_count total_mail=$recovery_mail_count" >&2
  "${compose[@]}" logs --no-color api api-peer
  exit 1
fi

invalid_channel_payload='{"messageId":"invalid-channel-1","idempotencyKey":"invalid-channel-1","sourceApp":"gpool","channel":"sms","templateId":"gpool.pool-invitation","recipient":{"email":"user@example.com"},"data":{"poolName":"Invalid"},"metadata":{},"requestedAt":"2026-03-11T00:00:00Z"}'
printf '%s\n' "$invalid_channel_payload" \
  | "${compose[@]}" exec -T redpanda \
    rpk topic produce notification.email.requested.v1 --partition 0 -k invalid-channel
printf '%s\n' '{malformed-json' \
  | "${compose[@]}" exec -T redpanda \
    rpk topic produce notification.email.requested.v1.DLT --partition 1 -k malformed

for _ in $(seq 1 60); do
  if [ "$(sql_value "SELECT count(*) FROM notification_dead_letters")" = "2" ]; then
    break
  fi
  sleep 2
done

dead_letter_count="$(sql_value "SELECT count(*) FROM notification_dead_letters")"
malformed_count="$(sql_value \
  "SELECT count(*) FROM notification_dead_letters WHERE request_id IS NULL AND raw_payload = '{malformed-json'")"
if [ "$dead_letter_count" != "2" ] || [ "$malformed_count" != "1" ]; then
  echo "DLT audit failure: total=$dead_letter_count malformed=$malformed_count" >&2
  "${compose[@]}" logs --no-color api api-peer
  exit 1
fi

echo "[integration] Health, metrics, migrations, concurrent idempotency, crash recovery, SMTP, and DLT audit passed"
