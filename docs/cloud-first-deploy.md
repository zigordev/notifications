# Cloud First Deploy (notifications)

Use this runbook when you are deploying `notifications` to AWS from scratch.
Complete `platform-ops/docs/cloud-first-deploy.md` first. `notifications` depends on the shared production host, OpenBao instance, shared Redpanda broker, and observability stack provisioned there.
To tear down the shared AWS infrastructure later, use `platform-ops/docs/cloud-destroy.md`.

## 1. What You Are Building

When this runbook is complete, you will have:

- the `notifications` API image published to ECR
- a production `notifications` deployment running on the shared EC2 host
- Gmail SMTP credentials stored in OpenBao
- Kafka, delivery, and observability config wired into the shared production platform

## 2. Prerequisites

Run every command in this document from the `notifications` repo root unless stated otherwise.

Required:

- `platform-ops` production is already deployed
- OpenBao production is initialized, unsealed, and has `kv` v2 enabled
- Redpanda from `platform-ops` is already running on the shared host
- AWS CLI with access to the target account
- `jq`
- GitHub access to configure repository environments
- a Gmail or Google Workspace account that can send production email through SMTP

## 3. Prepare The Gmail SMTP Credentials

This service uses Gmail SMTP.
Do not use the normal account password.

Use a Google App Password instead:

1. enable 2-Step Verification on the sending account
2. create an App Password for mail sending
3. keep that value for OpenBao key `SMTP_PASS`

You also need the sender identity:

- `SMTP_USER`
  - Gmail address used for SMTP authentication
- `SMTP_FROM`
  - sender address shown in outgoing mail

Those two values are tracked as non-secret config in `docker/.env.app.prod`.

## 4. Configure The GitHub `production` Environment

In the `notifications` GitHub repository, create or update environment `production`.

Required environment variables:

- `AWS_REGION`
  - AWS region used by the deploy workflow
- `AWS_ECR_API_REPOSITORY_URI`
  - ECR repository for the API image
- `AWS_DEPLOY_BUCKET`
  - S3 bucket used for deploy bundles
- `AWS_DEPLOY_INSTANCE_ID`
  - EC2 instance targeted through SSM
- `AWS_SSM_APP_PREFIX`
  - SSM prefix for `notifications`, for example `/notifications/prod/app`

Required environment secret:

- `AWS_DEPLOY_ROLE_ARN`
  - IAM role assumed by GitHub Actions through OIDC

Required repository secret:

- `RELEASE_PLEASE_TOKEN`
  - GitHub token used by Release Please to create release PRs, tags, and GitHub releases
  - use the same kind of token configured for `gpool`; releases created only with `GITHUB_TOKEN` do not trigger the deploy workflow

## 5. Review The Tracked Non-Secret Config

Review `docker/.env.app.prod` before the first deploy.

Important values:

- `TRUST_PROXY`
  - whether the service trusts proxy headers from the shared ingress
- `OTEL_EXPORTER_OTLP_ENDPOINT`
  - OTLP HTTP endpoint for traces
- `KAFKA_BOOTSTRAP_SERVERS`
  - Kafka bootstrap servers reachable from the production host
  - keep `platform-redpanda:9092` unless you intentionally move the shared broker
- `KAFKA_CONSUMER_GROUP_ID`
  - consumer group identity; keep `notifications-api` for the shared deployment
- `NOTIFICATIONS_EMAIL_TOPIC`
  - main email request topic
- `NOTIFICATIONS_EMAIL_DLT_TOPIC`
  - dead-letter topic for failed messages
- `NOTIFICATIONS_RETRY_INTERVAL_MS` / `NOTIFICATIONS_RETRY_MAX_ATTEMPTS`
  - SMTP retry policy; defaults are four total attempts separated by five seconds
- `NOTIFICATIONS_PROCESSING_LEASE_MS`
  - recovery timeout for a request left `processing` by a crashed worker
- `SMTP_HOST`
  - SMTP server hostname
- `SMTP_PORT`
  - SMTP port
- `SMTP_AUTH`
  - whether the SMTP transport authenticates; keep `true` for Gmail
- `SMTP_USER`
  - SMTP username / sender account
- `SMTP_FROM`
  - sender address shown in outgoing mail
- `SMTP_STARTTLS`
  - whether STARTTLS is enabled

Do not put real secrets in this file.

These placeholders are expected:

- `POSTGRES_PASSWORD=SET_FROM_OPEN_BAO`
- `OPENBAO_TOKEN=CHANGE_ME_PROD_OPENBAO_APP_READ_TOKEN`
- `API_IMAGE=REQUIRED_SET_BY_DEPLOY`

## 6. Create The OpenBao Secret `kv/notifications`

Create secret path `kv/notifications` in the OpenBao production UI.

Add these keys:

- `POSTGRES_PASSWORD`
  - production database password for `notifications`
- `SMTP_PASS`
  - Gmail app password for the sender account

## 7. Create The OpenBao Read Policy And App Token

Open an SSM shell on the production EC2 instance:

```bash
aws ssm start-session --profile platform-ops --target <AWS_DEPLOY_INSTANCE_ID> --region <AWS_REGION>
```

Inside that shell, resolve the latest deployed `platform-ops` release:

```bash
OPS_DIR="$(ls -1dt /opt/platform-ops/releases/* | head -n1)"
echo "$OPS_DIR"
```

Create the narrow read policy:

```bash
ROOT_TOKEN='paste_openbao_root_token'

sudo docker compose --env-file "$OPS_DIR/docker/.env.ops.prod" -f "$OPS_DIR/docker/compose.ops.prod.yml" exec -T \
  -e BAO_ADDR=http://127.0.0.1:8200 \
  -e BAO_TOKEN="$ROOT_TOKEN" \
  openbao sh -lc "
cat > /tmp/notifications-prod-read.hcl <<'EOF'
path \"kv/data/notifications\" { capabilities = [\"read\"] }
path \"kv/metadata/notifications\" { capabilities = [\"read\"] }
EOF
bao policy write notifications-prod-read /tmp/notifications-prod-read.hcl
"
```

Create the token:

```bash
NOTIFICATIONS_OPENBAO_TOKEN="$(
  sudo docker compose --env-file "$OPS_DIR/docker/.env.ops.prod" -f "$OPS_DIR/docker/compose.ops.prod.yml" exec -T \
    -e BAO_ADDR=http://127.0.0.1:8200 \
    -e BAO_TOKEN="$ROOT_TOKEN" \
    openbao bao token create -policy=notifications-prod-read -format=json | jq -r '.auth.client_token'
)"
echo "$NOTIFICATIONS_OPENBAO_TOKEN"
```

Use this token only for `notifications`.

## 8. Store The App Token In SSM

Store the app token under the app SSM prefix:

```bash
aws ssm put-parameter \
  --profile platform-ops \
  --name /notifications/prod/app/OPENBAO_TOKEN \
  --type SecureString \
  --value "$NOTIFICATIONS_OPENBAO_TOKEN" \
  --overwrite \
  --region <AWS_REGION>
```

If your prefix differs, use:

```bash
${AWS_SSM_APP_PREFIX}/OPENBAO_TOKEN
```

## 9. Trigger The First Deploy

The workflow is:

- `Deploy AWS App (EC2 Compose)` in `.github/workflows/deploy.yml`

Trigger it by:

- publishing a release tag
- or running `workflow_dispatch` with an existing `release_tag`

The workflow builds the API image, uploads the tracked deploy bundle, and runs the remote deploy script over SSM.

## 10. Validate The Production Service

From the EC2 instance or an SSM shell, resolve the deployed app release and run the checks
inside the API container (the service intentionally does not publish port 8080 on the host):

```bash
APP_DIR="$(ls -1dt /opt/notifications/releases/* | head -n1)"
cd "$APP_DIR"

sudo docker compose --env-file docker/.env.app.prod -f docker/compose.app.prod.yml exec -T \
  notifications_api curl -fsS http://127.0.0.1:8080/health/readiness
sudo docker compose --env-file docker/.env.app.prod -f docker/compose.app.prod.yml exec -T \
  notifications_api curl -fsS http://127.0.0.1:8080/metrics
```

The remote deploy script performs the same readiness check and fails the SSM deployment if the
new API container does not become ready.

Recommended functional checks:

- publish a test email event to Kafka
- confirm the message is consumed
- confirm delivery or failure is visible in logs and metrics

## 11. Troubleshooting And Notes

SMTP delivery fails:

- `SMTP_PASS` is wrong
- Gmail rejected the app password or account settings
- `SMTP_USER` and `SMTP_FROM` do not match the intended sender account

Deploy fails when reading OpenBao:

- OpenBao is sealed
- `kv/notifications` does not exist
- the token stored in SSM does not match `notifications-prod-read`

Kafka consumption fails:

- `KAFKA_BOOTSTRAP_SERVERS` is wrong
- the shared Redpanda service in `platform-ops` is not running
- topic names in `docker/.env.app.prod` do not match the producer apps

Cloudflare / public DNS note:

- no public DNS record is required for `notifications` unless you later expose a public UI or public API
- the service normally runs as an internal backend on the shared host
