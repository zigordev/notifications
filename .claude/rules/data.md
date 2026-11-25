---
paths:
  - "**/drizzle/**"
  - "**/migrations/**"
  - "**/drizzle.config.ts"
  - "**/*.sql"
  - "**/src/db/**"
  - "**/repository.ts"
---

# Data rules

These rules apply to schemas, migrations, queries and background jobs.

## Migrations

- A schema change is a forward-only migration. A migration that has run anywhere is never edited: a mistake gets a new migration.
- drizzle-kit writes the SQL from the schema. The SQL is read, committed, and applied by a one-shot `migrate` job before the app starts.
- A deploy runs the old and the new version side by side for a moment, so every change comes in steps the running version can live with: add first, switch over, remove later.
- A migration that deletes data, a table or a column waits for the owner. Say what is lost and how to get it back, and stop. The owner lets it through with the label `destructive-migration` on the pull request, which the `migrations` rule of `zigordev check` reads. A session never adds that label.

## Schema

- A table is plural and in snake_case, such as `pool_members`. Columns are in snake_case and map to camelCase in TypeScript.
- A primary key is a `uuid` that defaults to `uuidv7()`.
- Every table has `created_at` and `updated_at`, as `timestamptz` in UTC.

## Where data lives

- Each product owns one PostgreSQL 18 server, with one database and one role per app. No app reads another app's database.
- Queries go through Drizzle over node-postgres. Background jobs and schedules run in pg-boss, inside the product's own database.
- A second data store, a broker, a cache or a search engine needs a decision record first.
- An app keeps state only in the stores its `compose.yaml` declares, because the backup saves exactly those.

## Personal data

- Personal data stays in the EU, and never reaches logs, metrics, traces or error messages.
- Deleted data is gone from every backup within 30 days.
- Seed data is invented.

## Tests

- Tests run against a real PostgreSQL of the same major version as production, never against a mock.
