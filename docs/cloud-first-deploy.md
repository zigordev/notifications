# Cloud First Deploy (notifications)

Use this runbook to deploy `notifications` to AWS for the first time.

## 1. Prerequisites

- `platform-ops` is already deployed to the same EC2 host.
- OpenBao is initialized, unsealed, and has `kv` enabled.
- An ECR repository exists for the notifications API image.
- `docker/.env.app.prod` contains the correct non-secret production values.

## 2. GitHub `production` Environment

Required variables:

- `AWS_REGION`
- `AWS_ECR_API_REPOSITORY_URI`
- `AWS_DEPLOY_BUCKET`
- `AWS_DEPLOY_INSTANCE_ID`
- `AWS_SSM_APP_PREFIX`

Required secret:

- `AWS_DEPLOY_ROLE_ARN`

## 3. OpenBao Secret `kv/notifications`

Create secret path `notifications` with:

- `POSTGRES_PASSWORD`
- `SMTP_PASS`

## 4. App Token In SSM

Store the OpenBao token under:

```bash
${AWS_SSM_APP_PREFIX}/OPENBAO_TOKEN
```

## 5. Non-Secret Config In Repo

These are read from `docker/.env.app.prod`:

- `TRUST_PROXY`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `KAFKA_BOOTSTRAP_SERVERS`
- `NOTIFICATIONS_EMAIL_TOPIC`
- `NOTIFICATIONS_EMAIL_DLT_TOPIC`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_FROM`
- `SMTP_STARTTLS`

## 6. Deploy

Workflow:

- `Deploy AWS App (EC2 Compose)` in `.github/workflows/deploy.yml`

## 7. Validate

After deploy:

```bash
curl -fsS http://127.0.0.1:8080/health/readiness
curl -fsS http://127.0.0.1:8080/metrics
```

## Notes

- No Cloudflare route is required unless you later expose an admin or preview UI publicly.
- Kafka is currently self-hosted in this repo’s compose stack via Redpanda.
