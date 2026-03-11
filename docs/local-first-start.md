# Local First Start (notifications)

## 1. Prerequisites

- `platform-ops` local stack is running and OpenBao is initialized and unsealed.
- Docker is installed.
- Copy `docker/.env.app.local.example` to `docker/.env.app.local`.
- Put a valid `OPENBAO_TOKEN` in `docker/.env.app.local`.

## 2. Create OpenBao Secret `kv/notifications`

Create secret path `notifications` in OpenBao with:

- `POSTGRES_PASSWORD`
- `SMTP_PASS`

`SMTP_PASS` should be a Google app password for the Gmail account configured in `SMTP_USER`.

## 3. Configure Non-Secret Local Values

Edit `docker/.env.app.local`:

- `SMTP_USER`
- `SMTP_FROM`
- `TRUST_PROXY`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `KAFKA_BOOTSTRAP_SERVERS`

Default local Kafka broker is `notifications-redpanda:9092`.

## 4. Start

```bash
chmod +x scripts/local-stack-up.sh scripts/local-stack-down.sh scripts/local-stack-reset.sh
./scripts/local-stack-up.sh
```

Useful local endpoints:

- API health: `http://localhost:8080/health/readiness`
- Metrics: `http://localhost:8080/metrics`
- Redpanda Console: `http://localhost:8081`

## 5. Stop

```bash
./scripts/local-stack-down.sh
```

Reset volumes:

```bash
./scripts/local-stack-reset.sh
```
