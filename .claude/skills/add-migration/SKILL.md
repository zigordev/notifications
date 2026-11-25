---
name: add-migration
description: Add a database migration to an API app built on @zigordev/api. Changes the Drizzle schema, writes the SQL with drizzle-kit, reads it, and proves it on a real PostgreSQL. Use for any change to a table, a column, an index or a constraint.
---

# Add a migration

A migration is a SQL file that changes the database once, in every environment, in the order it was written. The app's migrate job applies it before the new version starts, while the old version still runs.

1. **Look for what waits for the owner.** A migration that deletes data, a table or a column waits: `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `DROP DATABASE`, `TRUNCATE`, `DELETE`, or a change of a column's type. Say what is lost and how it would come back, and stop until the owner says yes. The `migrations` rule of `zigordev check` fails such a pull request in CI until the owner adds the label `destructive-migration` to it, and warns on the laptop. Never add that label yourself.
2. **Plan steps that the running version survives.** The old and the new version run side by side for a moment. Add first: a new column is nullable or has a default. Switch the code over in the same or a later pull request. Remove what is old in a later one.
3. **Change the schema** in the app's `src/db/schema.ts`. Tables are plural, in snake_case in SQL and camelCase in TypeScript. A key is a `uuid` that defaults to `uuidv7()`. Timestamps are `timestamp({ withTimezone: true, precision: 3 })`, so that a cursor holds them exactly. Every table has `createdAt` and `updatedAt`.
4. **Write the SQL** with `pnpm --dir <app folder> run db:generate --name <what_it_does>`. drizzle-kit writes `drizzle/NNNN_<what_it_does>.sql` and its snapshot in `drizzle/meta/`. Name it by what it does, such as `add_notes_pinned`.
5. **Read the SQL**, line by line. It is committed as drizzle-kit wrote it, and a migration that has run anywhere is never edited: a mistake gets a new migration.
6. **Prove it** with `pnpm format`, then `pnpm exec vitest run --project <app>:db`. The app's global setup migrates the template database with every migration, so a broken one fails every test file.
7. **Test what it makes possible**: a constraint that refuses a value, a default that a new row gets, or the query that an index serves.
8. **Finish** with the `finish-work` skill. The pull request says what the migration does to the data that exists, and how it would be undone.
