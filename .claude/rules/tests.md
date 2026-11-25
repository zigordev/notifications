---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.test.js"
  - "**/*.spec.ts"
  - "**/e2e/**"
  - "**/vitest.config.ts"
  - "**/playwright.config.ts"
---

# Test rules

These rules apply to every test and to every change that needs one.

## What each change needs

| Layer   | Covers                                                                                         | How                                                              |
| ------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Unit    | Every function or service with logic                                                           | Vitest, in `*.test.ts` beside the code                           |
| API     | Every endpoint: success, 400 with every invalid field, 401 and 403, 404, and the error body    | `buildApp()` called through `app.inject()`, on a real PostgreSQL |
| Browser | Every critical path that the app's `docs/user-manual.md` lists, with an axe check on each page | Playwright, against the production-shaped containers             |

- A bug fix starts with a test that fails without the fix.
- A new rule or check comes with a test that breaks it and sees it fail.

## What never happens

- A threshold is never lowered. Coverage counts all of `src`, with a floor of 90%.
- A test is never skipped, deleted or made green by updating its snapshot. A wrong test is fixed in its own commit, with the reason.
- A real dependency is never mocked when a container can run it. Testcontainers starts PostgreSQL, and Mailpit catches the mail.
- A test never signs in at Google. Sign-in with Google runs against a stand-in.
- A test never reads `process.env` to reach a dependency. It passes the address in through the app's validated configuration.

## Running them

- `pnpm check` runs everything CI runs, and prints how long it took. The target is under 10 minutes.
- `pnpm check:quick` runs the part that needs no containers, and the push hook runs it.
- One file runs with `pnpm exec vitest run <path>`.
- Every test file gets its own copy of the migrated database. Tests that share one clean up after themselves or use their own rows.
