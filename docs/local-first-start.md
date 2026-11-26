# Start notifications on a clean laptop

This page takes a laptop with nothing installed to notifications running in containers, with its telemetry in a local Grafana and its mail in Mailpit. It takes about 15 minutes, most of it downloads.

## What you need

| Tool                              | Why                                                                                                         | How to get it            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| A Docker engine, such as OrbStack | Runs the shared services, the service, its job and PostgreSQL, and the tests' PostgreSQL, Kafka and Mailpit | Install it, and start it |
| mise                              | Installs the exact Node.js, pnpm, gitleaks and zizmor that `mise.toml` pins                                 | <https://mise.jdx.dev>   |
| git and the GitHub CLI            | To clone the repo and open pull requests                                                                    | `brew install git gh`    |

## Steps

1. Clone the repo and enter it:

   ```bash
   gh repo clone zigordev/notifications && cd notifications
   ```

2. Install the pinned tools, then the dependencies and the git hooks:

   ```bash
   mise install
   ```

   ```bash
   pnpm install
   ```

3. Run the whole check, as the pipeline does. The tests start their own PostgreSQL, Kafka and Mailpit, and send real requests through them:

   ```bash
   pnpm check
   ```

4. Start the shared services and the product:

   ```bash
   pnpm local:up
   ```

   It stops the shared services' own copy of notifications first, so the copy built from this folder alone reads the requests. It ends when every container is healthy. Open <http://notifications.localhost/health> for the service's health, <http://mail.localhost> for Mailpit, and <http://grafana.localhost> for its logs, traces and metrics.

5. Stop the product when you are done. The shared services keep running for the other products:

   ```bash
   pnpm local:down
   ```

## Kafka on the laptop

The broker comes from `@zigordev/stack`, like the other shared services. Until the stack has it, the service starts with Kafka down: `/health` answers `degraded` with `kafka` down, and no request arrives. Everything else works, and the tests use a broker of their own.

In its container the service reaches the broker at `kafka:9092`, on the network `zigordev`, as the user `notifications-api` with the throwaway password `local-only-notifications-api`, the one that `platform`'s stack gives that user. Mail goes to the stack's Mailpit at `mailpit:1025`, with no sign-in.

## Edit with hot reload

With the product up in containers, run the service on this Mac itself:

```bash
pnpm dev api
```

It runs under `node --watch`, at `http://127.0.0.1:3000`, with the settings of `apps/notifications-api/.env.development`. Those settings reach the broker at `localhost:9094`, the address the stack's broker will give processes on this Mac, and Mailpit's SMTP at `127.0.0.1:1025`. Until the stack has the broker and publishes Mailpit's SMTP port on this Mac, the dev service reports both down.

## When something does not work

| What you see                                                              | What it means                                                                                                         | What to do                                                                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install` stops at `lefthook install`                                | The folder is not a git clone                                                                                         | Clone it with git, as step 1 does                                                                                                                      |
| `pnpm local:up` says port 5435 is taken                                   | Another product's PostgreSQL uses the same port on this laptop                                                        | Stop that product, or change the port in `compose.local.yaml`, in the service's `.env.development` and in the tests that name it                       |
| The tests fail with "Could not find a working container runtime strategy" | Testcontainers finds no Docker socket                                                                                 | Start the Docker engine. With OrbStack, set `DOCKER_HOST` to its socket for the command                                                                |
| The tests fail with "did not accept its test user in time"                | The test broker did not start within two minutes                                                                      | Give Docker more memory, and run them again                                                                                                            |
| The service does not start, and says "The queues ... do not exist"        | The migrate job did not run against its database                                                                      | Run `pnpm local:up` again, which runs the job first                                                                                                    |
| `/health` answers `degraded` with `provider` down                         | The mail server cannot be reached                                                                                     | Check that the stack's Mailpit runs: `pnpm local:up` starts it                                                                                         |
| `/health` answers `error` with `topics` down                              | Kafka says a topic of an app in `producers.json` does not exist. The log line `events.topic_missing` names the topics | `platform` makes the topics in `KAFKA_SETUP`. On the laptop, `pnpm local:up` runs that job first, and the part turns `up` once the service reads again |
| <http://notifications.localhost/health> does not answer                   | The shared services are not running                                                                                   | Run `pnpm local:up` again. It starts them first                                                                                                        |
