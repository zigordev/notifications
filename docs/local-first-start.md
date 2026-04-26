# Local First Start (notifications)

Use this runbook when you are creating the `notifications` local environment from scratch.
Complete `platform-ops/docs/local-first-start.md` first. `notifications` depends on the shared OpenBao instance, shared Redpanda broker, shared Docker network, and shared observability stack started there.

## 1. What You Are Building

When this runbook is complete, you will have:

- the `notifications` API running on `http://localhost:8080`
- a local Postgres database for delivery/audit state
- the shared local Redpanda broker running in `platform-ops`
- Gmail SMTP delivery through the configured sender account
- health, metrics, logs, and traces wired into `platform-ops`

## 2. Prerequisites

Run every command in this document from the `notifications` repo root.

Required:

- `platform-ops` local stack is already running
- OpenBao in `platform-ops` is initialized and unsealed
- `kv` v2 is enabled in OpenBao
- Redpanda from `platform-ops` is running on the shared Docker network
- Docker
- `jq`
- a Gmail or Google Workspace account that can send SMTP mail

## 3. Prepare The Gmail App Password

The service uses Gmail SMTP.
Do not use your normal Gmail account password here.

Use a Google App Password instead:

1. enable 2-Step Verification on the Google account
2. create an App Password for mail sending
3. keep that value for OpenBao key `SMTP_PASS`

You will also need:

- `SMTP_USER`
  - the Gmail address used for SMTP authentication
- `SMTP_FROM`
  - the sender address shown in outgoing mail

In the default local example, both are `zigorlsp7@gmail.com`.

## 4. Create The OpenBao Secret `kv/notifications`

Open OpenBao:

- `http://localhost:8200/ui`

Create secret path `kv/notifications` with these keys:

- `POSTGRES_PASSWORD`
  - password for the local notifications Postgres database
- `SMTP_PASS`
  - Gmail app password from the previous step

## 5. Create A Read-Only Policy For `notifications`

Create an OpenBao ACL policy named `notifications-local-read`.
This step requires the OpenBao root token saved during the `platform-ops` bootstrap:

```bash
ROOT_TOKEN='paste_root_token_here'

docker compose --env-file ../platform-ops/docker/.env.ops.local -f ../platform-ops/docker/compose.ops.local.yml exec -T \
  -e BAO_ADDR=http://127.0.0.1:8200 \
  -e BAO_TOKEN="$ROOT_TOKEN" \
  openbao bao policy write notifications-local-read - <<'EOF'
path "kv/data/notifications" { capabilities = ["read"] }
path "kv/metadata/notifications" { capabilities = ["read"] }
EOF
```

## 6. Create The `notifications` OpenBao Token

Use the OpenBao root token created during the `platform-ops` bootstrap.

Create the app token:

```bash
ROOT_TOKEN='paste_root_token_here'

docker compose --env-file ../platform-ops/docker/.env.ops.local -f ../platform-ops/docker/compose.ops.local.yml exec -T \
  -e BAO_ADDR=http://127.0.0.1:8200 \
  -e BAO_TOKEN="$ROOT_TOKEN" \
  openbao bao token create -policy=notifications-local-read -format=json \
  | jq -r '.auth.client_token'
```

Copy the printed token and use it only for `notifications`.

## 7. Prepare The Local Env File

Create the real local env file from the tracked example:

```bash
cp docker/.env.app.local.example docker/.env.app.local
```

Edit `docker/.env.app.local`.

Set or review these values:

- `OPENBAO_TOKEN`
  - set it to the `notifications-local-read` token
- `SMTP_USER`
  - Gmail account used for SMTP auth
- `SMTP_FROM`
  - sender address shown in mail
- `TRUST_PROXY`
  - usually `false` locally
- `OTEL_EXPORTER_OTLP_ENDPOINT`
  - keep the default if you use the local `platform-ops` collector
- `KAFKA_BOOTSTRAP_SERVERS`
  - keep the default if you use the shared Redpanda broker from `platform-ops`
- `NOTIFICATIONS_EMAIL_TOPIC`
  - keep the default unless you intentionally changed your contracts
- `NOTIFICATIONS_EMAIL_DLT_TOPIC`
  - keep the default unless you intentionally changed your contracts

Leave these placeholders as they are:

- `POSTGRES_PASSWORD=SET_FROM_OPEN_BAO`
- `API_IMAGE=REQUIRED_SET_BY_DEPLOY`

## 8. Start The Local Stack

Start the service:

```bash
./scripts/local-stack-up.sh
```

What the script does:

- creates `docker/.env.app.local` from the tracked example if needed
- validates OpenBao reachability
- validates the token against `kv/notifications`
- validates the required OpenBao keys
- exports `POSTGRES_PASSWORD` from OpenBao
- starts the local Docker Compose stack

If the env file was auto-created and still contains the placeholder OpenBao token, the script stops and tells you to update it.

## 9. Validate The Local Service

Check readiness:

```bash
curl -fsS http://localhost:8080/health/readiness
```

Check metrics:

```bash
curl -fsS http://localhost:8080/metrics
```

Useful local URLs:

- API readiness: `http://localhost:8080/health/readiness`
- metrics: `http://localhost:8080/metrics`
- Redpanda Console (from `platform-ops`): `http://localhost:8081`

## 10. Daily Commands

Stop the stack but keep volumes:

```bash
./scripts/local-stack-down.sh
```

Stop the stack and delete local volumes:

```bash
./scripts/local-stack-reset.sh
```

Start it again:

```bash
./scripts/local-stack-up.sh
```

## 11. Troubleshooting

`OPENBAO_TOKEN ... still has the example value`:

- edit `docker/.env.app.local`
- replace the placeholder with the real app token

SMTP delivery fails:

- `SMTP_PASS` is wrong
- the Gmail account does not allow the app password
- `SMTP_USER` and `SMTP_FROM` do not match the sending account you intended

Kafka does not receive events:

- `platform-ops` is not running, so the shared broker does not exist
- the producing apps are not pointing at `platform-redpanda:9092`
- you changed topic names and the apps still publish to the defaults

You need logs:

```bash
docker compose --env-file docker/.env.app.local -f docker/compose.app.local.yml logs --no-color <service>
```

Common services:

- `api`
- `postgres`
- `alloy`
