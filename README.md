# notifications

Kafka-backed notification delivery service built with Node.js 24, TypeScript, and NestJS.

The service:

- consumes `notification.email.requested.v1` with the stable `notifications-api` consumer group
- validates the existing JSON event contract and renders localized Handlebars email templates
- sends email through configurable SMTP, with Gmail-compatible defaults
- stores delivery state and attempts in PostgreSQL
- provides atomic idempotency claims, processing leases for worker-crash recovery, and durable DLT audit records
- exposes `/health` and Prometheus `/metrics`
- emits JSON logs and OpenTelemetry traces for `platform-ops`

## Repository shape

- `apps/api` — NestJS worker, management endpoints, tests, SQL migrations, and templates
- `docker/` — app-local, app-dev, app-prod and CI compose manifests + env templates
- `scripts/` — OpenBao startup, deployment, and integration smoke scripts
- `.github/workflows/` — CI, deploy, release, governance workflows
- `docs/` — local and cloud runbooks

## Quick start

1. Install dependencies

```bash
npm ci
```

2. Start local app stack

```bash
npm run local:up
```

This app stack expects the shared Docker network from `platform-ops`
(`platform_ops_shared` by default), along with its OpenBao, Redpanda and
observability services. For first-time setup (OpenBao secrets/token), follow
`docs/local-first-start.md`.

For an edit-and-refresh loop instead of a rebuild:

```bash
npm run local:dev
```

Same preflight and same port, but the container builds its `dev` stage and runs
`nest start --watch` under `docker compose watch`, which copies changed
`apps/api/src` into it. Dependency manifests trigger a rebuild rather than a
sync. Both modes are the same service on the same port, so run one at a time.

3. Check stack

```bash
curl -fsS http://localhost:18080/health
curl -fsS http://localhost:18080/metrics
```

4. Stop stack

```bash
npm run local:down
```

`npm run local:reset` drops the local volumes and rebuilds from scratch.

## Quality commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:cov
npm run build
npm run audit
```

The containerized PostgreSQL, Redpanda, two-consumer, SMTP and DLT smoke test
runs with:

```bash
npm run test:integration
```

## Release + deploy model

- `Release Please` manages versioning/changelog + release PR.
- On release publish, `Deploy AWS App (EC2 Compose)` builds/pushes the API image and deploys remotely via AWS SSM.
- Runtime env comes from the SSM prefix in `AWS_SSM_APP_PREFIX` (for example `/notifications/prod/app`) rendered into `docker/.env.app.prod` on the host.
- Platform infra/ops services are owned by `platform-ops`; this repo only ships app stack compose + app config under `docker/`.

See:

- `docs/local-first-start.md`
- `docs/cloud-first-deploy.md`

## Interface contract

The migration retains the original external Kafka, SMTP, PostgreSQL V1, health, metrics, deployment, and OpenBao interfaces. New V2 database objects add processing-lease ownership and durable dead-letter auditing.
