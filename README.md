# notifications

Kafka-backed notification delivery service built with Node.js 24, TypeScript, and NestJS.

The service:

- consumes `notification.email.requested.v1` with the stable `notifications-api` consumer group
- validates the existing JSON event contract and renders localized Handlebars email templates
- sends email through configurable SMTP, with Gmail-compatible defaults
- stores delivery state and attempts in PostgreSQL
- provides atomic idempotency claims, processing leases for worker-crash recovery, and durable DLT audit records
- exposes `/health`, `/health/liveness`, `/health/readiness`, and Prometheus `/metrics`
- emits JSON logs and OpenTelemetry traces for `platform-ops`

## Repository layout

- `apps/api` — NestJS worker, management endpoints, tests, SQL migrations, and templates
- `docker` — local, production, and CI Compose definitions
- `scripts` — OpenBao startup, deployment, and integration smoke scripts
- `docs` — local and cloud runbooks

## Development

Use the Node and npm versions declared in `.node-version`, `.nvmrc`, and `packageManager`.

```bash
npm ci
npm run start:dev
```

The standard verification commands are:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:cov
npm run build
npm audit --omit=dev --audit-level=high
```

Run the containerized PostgreSQL, Redpanda, two-consumer, SMTP, and DLT smoke test with:

```bash
npm run test:integration
```

For the normal local stack (which uses the shared `platform-ops` OpenBao,
Redpanda, network, and observability services), use:

```bash
npm run local:up
npm run local:down
npm run local:reset
```

The migration retains the original external Kafka, SMTP, PostgreSQL V1, health, metrics, deployment, and OpenBao interfaces. New V2 database objects add processing-lease ownership and durable dead-letter auditing.

See [docs/local-first-start.md](docs/local-first-start.md) for local setup and [docs/cloud-first-deploy.md](docs/cloud-first-deploy.md) for first AWS deployment.
