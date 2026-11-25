# notifications

The notifications service of the zigordev platform: one service that delivers the email of every product. Products send request events over Kafka, and the service answers each one with an outcome event, as toolkit's record 0042 says. It started from the API half of toolkit's product template, step 5.1 of the Build plan, and step 5.2 carried November's delivery code over into it. The records in `docs/adr/` say why. The core rules in `.claude/rules/core.md` apply here as everywhere.

## Where things live

| Path                                  | What it holds                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/notifications-api`              | The service on `@zigordev/api`: its producers in `producers.json`, its flags in `flags.json`, its migrations in `drizzle/`, its image |
| `apps/notifications-api/src/features` | `emails`: reading the requests and writing the outcomes. `delivery`: SMTP, the monitor, the worker. `retention`: the daily deletion   |
| `apps/notifications-api/src/work.ts`  | Starts and stops the background work: pg-boss, the delivery worker, the retention job and `@zigordev/events`                          |
| `apps/notifications-api/test`         | The test helpers: Mailpit, the topics, a product that sends requests, and the service built for a test                                |
| `packages/notifications-events`       | `@zigordev/notifications-events`: the request and outcome events and their topic names, shared by the service and every product       |
| `compose.yaml`                        | The product as it runs everywhere. `compose.local.yaml` and `compose.production.yaml` hold only the differences                       |
| `compose.test.ts`                     | The test that holds the compose files and the Dockerfile to the container rules                                                       |
| `.env.production.example`             | The names of production's secrets. The values live in Parameter Store under `/notifications/<NAME>`                                   |
| `.github/workflows/ci.yml`            | The caller of toolkit's pipeline, publish and release workflows, pinned to one commit of toolkit                                      |
| `.claude/`                            | The shared rules, skills, hooks and permissions. `zigordev sync` writes them                                                          |
| `docs/`                               | The standard docs and the decision records                                                                                            |

## Commands

- `pnpm install` installs the dependencies and the git hooks.
- `pnpm check` runs what CI runs: lint, build, type check, and tests with coverage. Docker has to run, because the tests start a real PostgreSQL, Kafka and Mailpit. With OrbStack, put `DOCKER_HOST="unix://$HOME/.orbstack/run/docker.sock"` before the command.
- `pnpm check:quick` runs the same without coverage and without the tests that need a container. The push hook runs it.
- `pnpm local:up` starts the shared services and the product in containers, at `http://notifications.localhost`. `pnpm local:down` stops the product only.
- `pnpm dev api` runs the service on this Mac with hot reload, beside the containers.
- `pnpm check:contract` builds the image and holds it, and the compose files, to the platform contract.
- `pnpm --dir apps/notifications-api run db:generate --name <change>` writes the SQL of a change to the schema. `run openapi` rewrites its `openapi.json`.
- `pnpm --dir packages/notifications-events run contract` rewrites `events.json`, the committed contract of the events, after a change to one.
- `pnpm exec zigordev check` runs the rules a machine can check, and `pnpm exec zigordev sync` copies the shared files again.

## Rules of this repo

- The repo keeps the shape of the template's API half, without the HTTP client: products reach the service only through Kafka. A slice of the template that the service needs arrives as one pull request that copies it in, and a change that the template should have too goes to toolkit first.
- Kafka is reached only through `@zigordev/events`, in the tests too: `@zigordev/events/testing` makes the topics a test needs.
- A change to an event that a reader of its version would not understand is a new version of the event, in `packages/notifications-events`, read beside the old one.
- A new app that sends email is a line in `producers.json`, after `platform` has its Kafka user, its topics and their access rules.
- Never log, count or trace an address, a subject or a body. Log the email's id, the request's id and the producer.
- No Deploy job runs yet. It comes with step 5.5, once the platform has the deploy target `notifications`. From then on a merge to `main` deploys, and a change that should not be live yet ships behind a flag with a removal date.
- A new secret is a new line `NAME=` in `.env.production.example`, and its value is the owner's to store in Parameter Store before the merge that needs it.
- The PostgreSQL of this product listens on `127.0.0.1:5435` on the laptop, beside the template's on 5433 and the playground's on 5434.
- A shared file is changed in toolkit, never here. `pnpm check` fails while a copy differs.
