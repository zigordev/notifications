---
paths:
  - "**/apps/*-api/**"
  - "packages/api/**"
---

# API rules

These rules apply to every Fastify service and to `@zigordev/api`.

## Shape of a service

- `src/main.ts` starts the server. On SIGTERM it calls `app.close()`, which stops taking work, finishes what is in flight and closes every connection, within 30 seconds.
- `src/app.ts` exports `buildApp()`, which registers everything and never listens. Tests build the app with it.
- `src/config.ts` reads the environment once, validates it with Zod and fails at start on a missing setting. Nothing else reads `process.env`.
- `src/plugins/` holds what cuts across features: errors, auth, database, docs and health. `src/features/<name>/` holds `routes.ts`, `schemas.ts`, `service.ts` and `repository.ts`, with their tests beside them.
- Each feature is a plugin registered with its prefix. A shared instance, such as the database, is decorated once, in a plugin wrapped with `fastify-plugin`.
- Plugins come from `@fastify/*`. Express middleware is never mounted.

## Routes

- Every business endpoint lives under `/api/v1/`. A breaking change adds `/api/v2/` for the resources it touches, and v1 keeps working until its callers have moved.
- A resource is a lowercase plural noun in kebab-case, nested at most two levels, with no verb and no trailing slash: `/payment-methods`, `/organizations/{orgId}/members`.
- An action that is not CRUD is a `POST` to a noun below the resource, such as `POST /pools/{poolId}/invitations`, or else a kebab-case action segment.
- `GET` answers 200. A `POST` that creates answers 201 with a `Location` header. A `POST` that acts answers 200, or 202 when the work continues. `PUT` and `PATCH` answer 200 with the resource. `DELETE` answers 204.
- A list takes filters as `?field=value`, sorting as `sort=field` or `sort=-field`, and paging as `limit` (20 by default, 100 at most) and `cursor`. It answers `{ "items": [], "nextCursor": "..." }`, with no `nextCursor` on the last page. An unknown filter or sort field is a 400.
- JSON uses camelCase fields, UUIDs as ids, and timestamps in ISO 8601 UTC.

## Schemas and errors

- Every body, query, path parameter and header a route reads has a Zod schema, and objects are strict. Every status a route can return is declared, so Fastify drops any field the schema does not list.
- Every endpoint needs authentication unless it is explicitly marked public.
- An error is an RFC 9457 problem, `application/problem+json`, with `type`, `title`, `status`, `detail` and `instance`, plus a stable `code` and its `params`. A validation error lists every invalid field. A 5xx body carries no internal detail. One error handler and one not-found handler produce them all.
- A write that another service calls accepts an `Idempotency-Key` header.

## Contract

- Every route has a `summary`, `tags` and a stable camelCase `operationId`, such as `listPools`.
- The service serves Swagger UI at `GET /api/v1/docs` and the OpenAPI 3.1 document at `GET /api/v1/openapi.json`.
- The generated document is committed as `openapi.json` beside the app. CI fails when it drifts from the code, and the clients are regenerated from it in the same pull request.
- A service calls another service only over HTTP, through the client generated from that service's document, and keeps working when the other one is down.

## Telemetry

- `GET /health` sits at the root, outside any prefix. It answers 200 `ok`, 200 `degraded` when an optional component is down, and 503 `error` when a required one is. A new dependency is a new component.
- Logs are JSON lines on stdout through the shared logger, with fields at the top level and no personal data. An event is named `area.what_happened`. `error` means a person should look, `warn` a handled problem, and `info` lifecycle and business events.
- Metrics and traces go out over OTLP through `@zigordev/otel`. Names follow the OpenTelemetry conventions, attribute values are bounded (route patterns, never raw paths, ids or emails), and a new counter starts at zero.
- New I/O runs inside a span, and nothing calls `console`.
