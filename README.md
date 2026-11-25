# notifications

The notifications service of the zigordev platform. Every product will send its email through it: a product sends a request event over Kafka, and the service answers with an outcome event, sent or failed. toolkit's [record 0042](https://github.com/zigordev/toolkit/blob/main/docs/adr/0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md) holds that decision.

Today the repo holds its starting point, step 5.1 of the Build plan: the API half of toolkit's product template. It was made on 2026-11-25 from [toolkit](https://github.com/zigordev/toolkit) at version 1.25.0, and took the template's flag slice from version 1.26.0 the same day. It is an API on its own PostgreSQL, with its migrate job, its typed client and the client's generator. The service itself arrives in the next steps, and replaces the template's example feature.

## What it is

A product on the platform is an API and, most of the time, a web app. A service that sends email has no pages, so this repo took the template's API half and left the web app out.

| Path                                      | What it holds                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/notifications-api`                  | The API: a Fastify service on `@zigordev/api` with a greeting behind a feature flag and the notes, its flags in `flags.json`, its migrations in `drizzle/`, its `openapi.json` and its `Dockerfile` |
| `packages/notifications-api-client`       | The API's typed client: the types written from `openapi.json`, and `createNotificationsApiClient()` on openapi-fetch                                                                                |
| `packages/notifications-client-generator` | The one package that writes those types, with openapi-typescript on its own TypeScript 5.9.3                                                                                                        |
| `compose.yaml`                            | The whole product as it runs everywhere: the API, its migrate job and the product's PostgreSQL, each with its limits and health check                                                               |
| `compose.local.yaml`                      | What differs on the laptop: the image is built here, the address is `notifications.localhost`, and PostgreSQL answers on `127.0.0.1:5435`                                                           |
| `compose.production.yaml`                 | What differs in production: the address, and that the deploy runs the migrate job itself                                                                                                            |
| `compose.test.ts`                         | The test that holds the three compose files and the Dockerfile to the container rules                                                                                                               |
| `package.json`                            | The scripts of every repo, and `local:up`, `local:down`, `local:reset`, `dev` and `check:contract`                                                                                                  |
| `.env.production.example`                 | The names of the secrets that production needs. Only the names: the values live in AWS Parameter Store                                                                                              |
| `.github/workflows/ci.yml`                | The repo's caller: the pipeline on every pull request, then publish on every merge to `main`                                                                                                        |
| `docs/`                                   | How to start it on a clean laptop, how it reaches production, what a user can do, and the decisions about this repo                                                                                 |

Its product name is `notifications`, so its app is `notifications-api`. An app has one name, in its folder, its package, its compose service, its image and its telemetry.

## Why it exists

One service delivers the email of every product, to Mailpit on the laptop and through Amazon SES in production. Delivery, retries, limits and the mail credentials then live in one place, with one log of every email. toolkit's [record 0019](https://github.com/zigordev/toolkit/blob/main/docs/adr/0019-email-through-the-notifications-service.md) chose the service, and record 0042 moved its requests and answers to Kafka.

It is also the first real service through the whole pipeline, so it proves the service half of the platform. It starts from the template so that it has the same shape as every other product from its first day. [Record 0001](docs/adr/0001-notifications-starts-from-the-api-half-of-the-template.md) holds that decision.

## What it is built with

| Tool               | What it does here                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Node.js 26         | Runs the API. Its TypeScript files run directly, with no build step                                      |
| Fastify 5          | Serves the API's routes                                                                                  |
| `@zigordev/config` | Reads the API's settings from the environment once, and stops it when one is wrong                       |
| `@zigordev/otel`   | The API's traces, metrics and log lines, and the answer of its health route                              |
| `@zigordev/api`    | The API's base: the error format, paging, sign-in checks, the OpenAPI pages, the database and the stop   |
| `@zigordev/flags`  | The API's feature flags, read from its own `flags.json` through OpenFeature, with no flag server         |
| PostgreSQL 18      | The product's database, in a container of its own on a network of its own                                |
| Drizzle            | The API's queries, and with drizzle-kit the SQL of each migration                                        |
| `@zigordev/test`   | A real PostgreSQL for the tests, with one migrated copy per test file                                    |
| Docker Compose     | Runs the product as one project, on the network of the shared services                                   |
| The Node.js image  | The official image on Alpine Linux, at the same Node.js version as `mise.toml`. The API's image is on it |
| Vitest 5           | Tests the routes, the API once as a real process, the client against the real API, and the compose files |

The `@zigordev/*` packages come from npm, at the version that `pnpm-workspace.yaml` pins. Renovate proposes each new version.

## Quick start

There are two ways to run it. The first is the product as it runs in production, in containers. The second is the API as a plain process on this Mac, beside the containers.

### In containers, behind the shared services

It needs Docker. The shared services come with it: the ingress, the telemetry agent and Grafana are the package `@zigordev/stack`, which [platform](https://github.com/zigordev/platform) publishes and this repo takes from npm. From the repo's folder:

```bash
pnpm local:up
```

The script has two halves. `zigordev-stack up` starts the shared services and waits until each one is healthy. When they already run, it changes nothing. `docker compose up` then builds the API's image, starts PostgreSQL, runs the migrate job once, starts the API, and returns when it is healthy. The first build takes a few minutes, most of them downloads.

| Address                                       | Answers                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `http://notifications.localhost/api/v1/hello` | The API: `{"message":"Hello from notifications-api"}`                                            |
| `http://notifications.localhost/health`       | The API's health: its name, the version that runs, and whether its database and its flags are up |
| `http://notifications.localhost/api/v1/docs`  | The API's OpenAPI pages, with every request and every error                                      |
| `http://grafana.localhost`                    | Grafana. The dashboard named App, in the folder zigordev, lists `notifications-api`              |

`pnpm local:down` stops and removes the product's containers, and leaves the shared services running, because other products use them. `pnpm local:reset` does the same, removes the product's volumes, and starts it again.

[The laptop platform](https://github.com/zigordev/toolkit/blob/main/docs/handbook/the-laptop-platform.md) explains the shared services and what an app does to be served. [Telemetry](https://github.com/zigordev/toolkit/blob/main/docs/handbook/telemetry.md) follows one request of the template, which this product copies, through Grafana, as a trace, a log line and a metric.

### While you edit the API: hot reload

With the product up in containers, run the API on this Mac itself:

```bash
pnpm dev api
```

It runs the API under `node --watch`, at `http://127.0.0.1:3000`, and restarts it about a second after a saved change. No image is built, and the rest of the product keeps running in its containers. `pnpm dev` alone says how to name the app.

The API reads its dev settings from its own `.env.development`. The file holds no secret, so it is committed. The API checks those settings with the same schema as in its container, and a variable set in the shell wins over the file. A missing setting stops it with the same message as in its container, and the watcher then waits for a change of a file before it tries again.

A dev process differs from its container in a few ways, all on purpose:

| What             | In its container                       | With `pnpm dev api`                                                         |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| Where it listens | Port 3000, reached through the ingress | `127.0.0.1` only, so nothing outside this Mac reaches it                    |
| Its version      | `local`                                | `dev`, so Grafana tells the two copies apart                                |
| Its log lines    | Read by the agent, and kept in Grafana | Printed in the terminal, where the agent does not read them                 |
| Its telemetry    | Sent to the agent at `alloy:4318`      | Sent to the agent at `127.0.0.1:4318`, giving up on a send after one second |

The shared services publish the agent's port on this Mac from `@zigordev/stack` 1.1.0 on, which this product takes. When the agent cannot be reached there, the dev API writes one error line a minute about it, and carries on.

## The settings

| Variable                      | Read by          | What it holds                                                                | When it is not set                              |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `OTEL_SERVICE_NAME`           | The API, the job | The app's one name                                                           | The app does not start                          |
| `OTEL_SERVICE_VERSION`        | The API, the job | The version that runs, shown in its logs, traces and metrics                 | It is left out                                  |
| `LOG_LEVEL`                   | The API, the job | `debug`, `info`, `warn` or `error`                                           | `info`                                          |
| `PORT`                        | The API          | The port it listens on                                                       | 3000                                            |
| `HOST`                        | The API          | The address it listens on                                                    | `0.0.0.0`, every one                            |
| `DATABASE_URL`                | The API, the job | The address of the app's database, as its own role                           | The app does not start                          |
| `API_KEYS`                    | The API          | The callers it knows, as JSON: a name, the SHA-256 of the key and the scopes | Nobody, so every notes request gets 401         |
| `FLAGS_FILE`                  | The API          | The path of its flags file                                                   | Its own `flags.json`, beside its `package.json` |
| `DATABASE_ADMIN_URL`          | The job          | The superuser's address, to make the app's role and database                 | The job only migrates                           |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry    | Where the telemetry goes. The compose file names the agent                   | `http://localhost:4318`                         |
| `OTEL_RESOURCE_ATTRIBUTES`    | OpenTelemetry    | The environment the app runs in, as `local` or `production`                  | It is left out                                  |

The compose files set every one of them that a container needs. The API reads nothing but environment variables.

## The notes API

The notes are the template's example feature, kept until the service replaces them. They show every piece a feature needs: a table, its migrations, its routes, its scopes, its tests on a real database and its place in the OpenAPI file.

| Method and path                 | Operation    | Scope         | Answers                              |
| ------------------------------- | ------------ | ------------- | ------------------------------------ |
| `GET /api/v1/notes`             | `listNotes`  | `notes:read`  | 200 with a page of notes             |
| `POST /api/v1/notes`            | `createNote` | `notes:write` | 201 with the note and its `Location` |
| `GET /api/v1/notes/{noteId}`    | `getNote`    | `notes:read`  | 200 with the note, or 404            |
| `PATCH /api/v1/notes/{noteId}`  | `updateNote` | `notes:write` | 200 with the changed note, or 404    |
| `DELETE /api/v1/notes/{noteId}` | `deleteNote` | `notes:write` | 204, or 404                          |

A list filters by `status` and by `q`, a text that the title holds in any case, sorts by `createdAt`, `updatedAt` or `title`, newest first unless asked, and pages with `limit` and `cursor`. Every error is a problem in the platform's format, and the docs page at `/api/v1/docs` shows them all.

A caller signs in with an API key in `Authorization: Bearer <key>`. The API keeps only the SHA-256 of each key, in `API_KEYS`, so the key itself is never in a setting the API reads. To try the notes on this Mac, make a key and start the API with it:

```bash
KEY=$(openssl rand -hex 16)
DIGEST=$(printf '%s' "$KEY" | shasum -a 256 | cut -d' ' -f1)
API_KEYS="[{\"name\":\"me\",\"sha256\":\"$DIGEST\",\"scopes\":[\"notes:read\",\"notes:write\"]}]" pnpm dev api
```

Then `curl -H "authorization: Bearer $KEY" http://127.0.0.1:3000/api/v1/notes` lists the notes.

### The database

The product's PostgreSQL runs as `notifications-postgres`, on the network `notifications`, which only the API and its job join. On the laptop it also answers at `127.0.0.1:5435`, so that `pnpm dev api` reaches it. The template's PostgreSQL takes 5433 and the playground's 5434, so the three can run side by side. The API connects as its own role, `notifications_api`, to its own database, `notifications_api`.

Before the API starts, the one-shot job `notifications-api-migrate` runs on the API's own image: it makes the role and the database when they are missing, and applies the migrations in `apps/notifications-api/drizzle/`. On the laptop the API waits for it. In production the deploy runs it once, before the new version starts, and stops when it fails. The handbook page [Data](https://github.com/zigordev/toolkit/blob/main/docs/handbook/data.md) explains why.

A change to the tables is a migration, and a change to a route regenerates the OpenAPI file:

```bash
pnpm --dir apps/notifications-api run db:generate --name add_notes_pinned
pnpm --dir apps/notifications-api run openapi
```

The first writes the SQL of a schema change into `drizzle/`, which is read and committed as it is. The second writes `openapi.json`, and a test fails while the file and the code differ. The skills `add-migration` and `add-endpoint` in `.claude/skills/` hold the steps.

### The client

`packages/notifications-api-client` is the typed client of the API. Its types are written from `openapi.json`, so a changed endpoint breaks the code that calls it when it compiles, not in production:

```ts
import { createNotificationsApiClient } from 'notifications-api-client';

const api = createNotificationsApiClient({ baseUrl: 'http://notifications-api:3000', key });
const { data, error } = await api.GET('/api/v1/notes', { params: { query: { status: 'open' } } });
```

After a change to `openapi.json`, write the types again with `pnpm --dir packages/notifications-api-client run generate`. A test fails while they differ from the file. The generator runs on TypeScript 5.9.3, because openapi-typescript does not run on TypeScript 7. toolkit's [record 0036](https://github.com/zigordev/toolkit/blob/main/docs/adr/0036-the-client-generator-runs-on-its-own-typescript-5.md) says why, and when that ends.

Products will not call the service over HTTP: record 0042 gives them a package of typed events instead, published from this repo. The client stays while the template's API does, and goes when that package arrives.

## The feature flags

The API keeps its flags in `apps/notifications-api/flags.json`, and reads them in the app through [`@zigordev/flags`](https://github.com/zigordev/toolkit/blob/main/packages/flags/README.md). Its image carries the file, so a flag changes through a pull request and takes effect with the deploy. No flag server runs.

It has the template's one flag, `friendly-greeting`, and it is off. `GET /api/v1/hello` answers `Hello from notifications-api` while it is off, and `Hi there, from notifications-api` once a pull request sets its `defaultVariant` to `on`. It is the smallest example of a feature that ships switched off, and it goes with the greeting when the service replaces it.

Every flag carries a removal date in `metadata.removeBy`. The `flags` rule of `zigordev check` fails `pnpm check` on a flag past its date, so `friendly-greeting` has to go, or its date has to move, by 2027-11-30.

A test sets a flag by pointing `FLAGS_FILE` at a file of its own, as the API's `app.test.ts` does for the friendly greeting.

## How the API starts

Node.js loads `@zigordev/otel/register` with `--import`, before any code of the app. Telemetry is then in place when the server is created, so each request gets a span and a duration. The last line of the `Dockerfile` is that same command.

When a setting is missing, the API stops at once: it writes which settings are wrong to its error output, and ends with code 1 before it takes a request. It gets this from Node.js, which ends a process on an error that nobody caught.

The start lives in `src/start.ts`. `start()` reads the settings, builds the app, listens and writes `service.started`. The server it returns has a `stop()`, which writes `service.stopping`, closes the app, sends the last telemetry and gives the exit code. `stopOnSignals()` calls it on a SIGTERM or a SIGINT. `src/main.ts` is the two lines that join them.

That keeps every line that does something inside the tests' reach. A test that starts `src/main.ts` as a process of its own proves the real start and stop, but coverage cannot see inside that process. This product counts the coverage of its app and packages, against the same floor of 90% as toolkit.

## How it runs in containers

`compose.yaml` describes each service once, the way it runs everywhere. The other two files hold only what differs.

| What                 | In `compose.yaml`                                                                                                              | Why                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The image            | `ghcr.io/zigordev/notifications-api:${VERSION:-local}`                                                                         | One image per app, tagged with the version that runs                                                                                                                 |
| The version          | `VERSION` also becomes `OTEL_SERVICE_VERSION`                                                                                  | The telemetry names the same version as the image. A laptop build is `local`                                                                                         |
| The user             | `user: "1000:1000"`, the user `node` of the image                                                                              | Nothing runs as root                                                                                                                                                 |
| The file system      | `read_only: true`, with `/tmp` in memory, of 1 MiB, for the drain below                                                        | A process that is broken into can change no file                                                                                                                     |
| The privileges       | `cap_drop: [ALL]` and `no-new-privileges`                                                                                      | The process holds no special right and can gain none                                                                                                                 |
| The first process    | `init: true`                                                                                                                   | Signals reach the app, and no dead child process stays behind                                                                                                        |
| The stop             | `stop_grace_period: 30s`                                                                                                       | The app gets 30 seconds to finish its requests after a SIGTERM                                                                                                       |
| The limits           | 256 MiB and one CPU for the API, 128 MiB for the job, 256 MiB for PostgreSQL                                                   | One app can never take the host down                                                                                                                                 |
| The health check     | It fails while `/tmp/drain` exists, and otherwise `wget` asks `http://127.0.0.1:3000/health`, every 10 seconds                 | Compose and the deploy know when the app can take requests, and the ingress stops sending it requests while it drains                                                |
| The drain            | The label `docker-rollout.pre-stop-hook: "touch /tmp/drain && sleep 35"`                                                       | On a deploy, docker-rollout writes `/tmp/drain` in the old container. Its health check fails within 30 seconds, the ingress takes it out, and only then does it stop |
| The restart          | `restart: unless-stopped`, for the API and the database. The migrate job keeps `restart: "no"`                                 | The host restarts itself at night for its updates, and everything comes back                                                                                         |
| Images of others     | The database's image is pinned by its digest: `postgres:18.7-alpine3.24@sha256:…`. The API's tests read it from `compose.yaml` | The host runs exactly the image that was checked, and the tests run the same one. Renovate proposes a new digest                                                     |
| The route            | Two labels: `traefik.enable`, and the port the app listens on                                                                  | The ingress finds the app by its labels. No port is published                                                                                                        |
| The network          | `zigordev`, which the shared services create                                                                                   | The ingress and the telemetry agent are reached by name on it                                                                                                        |
| The telemetry target | `OTEL_EXPORTER_OTLP_ENDPOINT: http://alloy:4318`                                                                               | Every app sends to the agent, and never to Grafana itself                                                                                                            |
| The backup           | The label `com.zigordev.backup: postgres` on the database                                                                      | The backup on the host finds the database by it                                                                                                                      |

`compose.local.yaml` adds how the image is built, the environment name `local`, and the address `notifications.localhost`. `compose.production.yaml` adds the environment name `production` and the address `notifications.zigordev.com`. In the template the API answers only under `/api`, because the web app takes the rest of the address. This product has no web app, so the API takes the whole address, and `/health` at the product's address is the API's own. That is the address the deploy asks from outside.

### How the image is built

The image is built from the root of this repo, which `compose.local.yaml` names as the build context. The `Dockerfile` has its own ignore file beside it, `Dockerfile.dockerignore`, which keeps `.git`, the docs, the tests and every `node_modules` out of the build.

The `Dockerfile` has two stages on the same Node.js image.

1. **The build stage** installs pnpm at the version that `package.json` pins, installs from the lockfile, and then runs `pnpm deploy --prod`. That command writes one self-contained folder: the app with its production dependencies only.
2. **The final stage** takes the current Alpine packages, removes npm, copies that folder in, and switches to the user `node`.

## How it reaches production

`.github/workflows/ci.yml` runs three jobs today. On a pull request, the pipeline and its gate `check`. On a merge to `main`, also Publish, which builds the API's image for arm64, pushes it as `ghcr.io/zigordev/notifications-api:<commit>` and attests it. The three workflows are toolkit's, pinned to one commit of it, and Renovate moves them together.

The Deploy job comes with step 5.5, once the platform has the deploy target `notifications`. [How it reaches production](docs/cloud-first-deploy.md) says what each step needs, and toolkit's handbook page [Delivery](https://github.com/zigordev/toolkit/blob/main/docs/handbook/delivery.md) explains each one in depth.

## The contract test

Every app on the platform keeps twelve promises, and [the platform page](https://github.com/zigordev/toolkit/blob/main/docs/handbook/the-platform.md) lists them. The first six are checked on the image itself, and promise 7 on the compose files and on each app that the ingress routes:

```bash
pnpm check:contract
```

It builds the image, starts the product once more under the name `notifications-contract`, on a network of its own, and holds the app to the promises with `zigordev contract`. It first reads `compose.yaml` and `compose.production.yaml` together, as the host does, and checks the rules of the deploy and the backup that [Delivery](https://github.com/zigordev/toolkit/blob/main/docs/handbook/delivery.md) lists. A product that already runs at `notifications.localhost` is not touched. It needs Docker running, but not the shared services.

The pipeline runs the same script on every pull request, in a job named Contract, on an arm64 machine. [The developer setup](https://github.com/zigordev/toolkit/blob/main/packages/dev/README.md) says what the command does to see each promise.

## What is left for later

Phase 5 of the Build plan builds the rest, each step as its own pull requests:

- **The service:** it reads one request topic per product from Kafka, sends each email over SMTP, retries, and answers on the product's own answer topic. It replaces the greeting and the notes.
- **The package of events:** the schemas of the requests and the outcomes, published from this repo. It replaces the client.
- **The platform side,** in `platform`: the broker, the mail identity and password, and the deploy target.
- **Production:** the Deploy job, and a real email sent from a merge with no manual step.
- **Its runbooks and alerts:** delivery failures, and mail that is stuck.

Each later slice of the template that the service needs arrives as one pull request that copies it in, as the flag slice did on 2026-11-25.
