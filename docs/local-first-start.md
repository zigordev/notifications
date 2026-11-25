# Start notifications on a clean laptop

This page takes a laptop with nothing installed to notifications running in containers, with its telemetry in a local Grafana. It takes about 15 minutes, most of it downloads.

## What you need

| Tool                              | Why                                                                                | How to get it            |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------ |
| A Docker engine, such as OrbStack | Runs the shared services, the API, its job and PostgreSQL, and the tests' database | Install it, and start it |
| mise                              | Installs the exact Node.js, pnpm, gitleaks and zizmor that `mise.toml` pins        | <https://mise.jdx.dev>   |
| git and the GitHub CLI            | To clone the repo and open pull requests                                           | `brew install git gh`    |

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

3. Start the shared services and the product:

   ```bash
   pnpm local:up
   ```

   It ends when every container is healthy. Open <http://notifications.localhost/health> for the API's health, <http://notifications.localhost/api/v1/docs> for its OpenAPI pages, and <http://grafana.localhost> for its logs, traces and metrics.

4. Run the whole check, as the pipeline does. Docker has to run, because the API's tests start a real PostgreSQL:

   ```bash
   pnpm check
   ```

5. Stop the product when you are done. The shared services keep running for the other products:

   ```bash
   pnpm local:down
   ```

To edit the API with hot reload beside the containers, run `pnpm dev api`. The [README](../README.md) explains both ways to run it, and every setting.

## When something does not work

| What you see                                                                    | What it means                                                  | What to do                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` stops at `lefthook install`                                      | The folder is not a git clone                                  | Clone it with git, as step 1 does                                                                                             |
| `pnpm local:up` says port 5435 is taken                                         | Another product's PostgreSQL uses the same port on this laptop | Stop that product, or change the port in `compose.local.yaml`, in the API's `.env.development` and in the tests that name it  |
| The API's tests fail with "Could not find a working container runtime strategy" | Testcontainers finds no Docker socket                          | Start the Docker engine. With OrbStack, let it own `/var/run/docker.sock`, or set `DOCKER_HOST` to its socket for the command |
| <http://notifications.localhost/health> does not answer                         | The shared services are not running                            | Run `pnpm local:up` again. It starts them first                                                                               |
