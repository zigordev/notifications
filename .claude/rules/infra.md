---
paths:
  - "infra/**"
  - "host/**"
  - "stack/**"
  - "observability/**"
  - "**/compose*.yaml"
  - "**/Dockerfile"
  - "**/.dockerignore"
  - "**/*.tofu"
  - "**/*.tf"
---

# Infrastructure rules

These rules apply to OpenTofu code, compose files, Dockerfiles and everything the host runs.

## Changes

- Everything in AWS, Cloudflare, GitHub and Grafana Cloud is code in `platform`, changed through a pull request. Nothing is changed by hand, and a weekly run alerts when reality differs from the code.
- The plan shows in the pull request. The apply waits for the owner's approval in GitHub. A session never gives that approval, and never runs an apply itself without a yes.
- Only `platform` can change infrastructure. A product repo can do one thing in AWS: ask the host to run a version of itself.
- What exists once per product comes from data, one entry per product, never from a copied block.
- No cloud key is stored anywhere. GitHub signs in to AWS with short-lived credentials, and each repo gets one narrow role.

## Secrets

- A production secret lives in AWS Parameter Store under `/<product>/<NAME>`, and the deploy reads it on the host. Only its name is in git, in `.env.production.example`.
- A session never sets, rotates or deletes a secret or a variable. Say exactly what is needed, and the owner sets it.
- Secrets never reach git, logs, metrics, traces or an error message. Nothing secret is printed in a workflow, because the logs are public.

## Containers

- An image is built for arm64, runs as a non-root user, and is tagged with its commit as `ghcr.io/zigordev/<app>`. Only an image that our own pipeline built is deployed.
- `compose.yaml` describes the whole product as it runs everywhere: for each service a health check, a memory and CPU limit, its route labels and its data stores. `compose.local.yaml` and `compose.production.yaml` hold only the few differences.
- A container runs with `init: true`, `no-new-privileges` and a `stop_grace_period`, and stops cleanly within 30 seconds of a SIGTERM. No wrapper process sits between the init and the app.
- Every build context has a `.dockerignore`. A base image's major version changes only together with the Node pin and `engines`.
- An app reads its settings from environment variables only, listens on `PORT`, and has one name everywhere, `<product>-<part>`: folder, package, compose service, image, telemetry and dashboard.

## The host

- The host opens no port to the internet. Traffic arrives through the Cloudflare Tunnel, and a shell arrives through AWS Systems Manager.
- A host job is a systemd timer, never a cron entry. A container never gets the instance role, and the metadata hop limit stays at 1.
- Config is checked the way the container receives it, with explicit variables, never with a whole env file.

## On the laptop

- `pnpm local:up` starts the whole product in containers from the committed compose files, never from `docker run` commands. `pnpm dev` runs the one app being edited, with hot reload.
- Never stop, recreate or reconfigure a container you did not start. Test in throwaway containers with their own names, ports and volumes.
