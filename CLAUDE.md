# notifications

The notifications service of the zigordev platform: one service that will deliver the email of every product, taking requests and giving outcomes over Kafka, as toolkit's record 0042 says. Today it is the API half of toolkit's product template, the start of step 5.1 of the Build plan, and the service replaces the template's example feature in the next steps. Record 0001 in `docs/adr/` says why it starts that way. The core rules in `.claude/rules/core.md` apply here as everywhere.

## Where things live

| Path                                      | What it holds                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/notifications-api`                  | The API on `@zigordev/api`: the greeting and the notes, its flags in `flags.json`, its migrations in `drizzle/`, its `openapi.json`, its image |
| `packages/notifications-api-client`       | The API's typed client, written from `openapi.json`                                                                                            |
| `packages/notifications-client-generator` | The one package that writes those types, on its own TypeScript 5.9.3                                                                           |
| `compose.yaml`                            | The product as it runs everywhere. `compose.local.yaml` and `compose.production.yaml` hold only the differences                                |
| `compose.test.ts`                         | The test that holds the compose files and the Dockerfile to the container rules                                                                |
| `.env.production.example`                 | The names of production's secrets. The values live in Parameter Store under `/notifications/<NAME>`                                            |
| `.github/workflows/ci.yml`                | The caller of toolkit's pipeline and publish workflows, pinned to one commit of toolkit                                                        |
| `.claude/`                                | The shared rules, skills, hooks and permissions. `zigordev sync` writes them                                                                   |
| `docs/`                                   | The standard docs and the decision records                                                                                                     |

## Commands

- `pnpm install` installs the dependencies and the git hooks.
- `pnpm check` runs what CI runs: lint, build, type check, and tests with coverage. Docker has to run, because the API's tests start a real PostgreSQL.
- `pnpm check:quick` runs the same without coverage and without the tests that need a container. The push hook runs it.
- `pnpm local:up` starts the shared services and the product in containers, at `http://notifications.localhost`. `pnpm local:down` stops the product only.
- `pnpm dev api` runs the API on this Mac with hot reload, beside the containers.
- `pnpm check:contract` builds the image and holds it, and the compose files, to the platform contract.
- `pnpm --dir apps/notifications-api run db:generate --name <change>` writes the SQL of a change to the API's schema. `run openapi` rewrites its `openapi.json`.
- `pnpm --dir packages/notifications-api-client run generate` writes the client's types from `openapi.json`.
- `pnpm exec zigordev check` runs the rules a machine can check, and `pnpm exec zigordev sync` copies the shared files again.

## Rules of this repo

- The repo keeps the shape of the template's API half. A slice of the template that the service needs arrives as one pull request that copies it in, and a change that the template should have too goes to toolkit first.
- No Deploy job runs yet. It comes with step 5.5, once the platform has the deploy target `notifications`. From then on a merge to `main` deploys, and a change that should not be live yet ships behind a flag with a removal date.
- A new secret is a new line `NAME=` in `.env.production.example`, and its value is the owner's to store in Parameter Store before the merge that needs it.
- The PostgreSQL of this product listens on `127.0.0.1:5435` on the laptop, beside the template's on 5433 and the playground's on 5434.
- A shared file is changed in toolkit, never here. `pnpm check` fails while a copy differs.
