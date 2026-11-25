# How notifications reaches production

notifications is not deployed yet. Today every merge to `main` runs the pipeline and publishes the API's image, and the deploy comes with step 5.5 of the Build plan. This page says what runs now, what the deploy adds, and what production needs once. toolkit's handbook page [Delivery](https://github.com/zigordev/toolkit/blob/main/docs/handbook/delivery.md) explains every step in depth.

## The path of a merge

```mermaid
flowchart LR
  merge["Merge to main"] --> check["check: the pipeline"]
  check --> publish["Publish: the API's image, built and attested"]
  publish -.-> deploy["Deploy, from step 5.5: verified, then sent to the host"]
  deploy -.-> outside["https://notifications.zigordev.com/health names the commit"]
```

| Job     | What it does                                                                                                                                                          | Runs today |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| check   | toolkit's pipeline: `pnpm check`, the title, the dependencies, the code scan, and the contract on the built image                                                     | Yes        |
| Publish | Builds `ghcr.io/zigordev/notifications-api` for arm64 under the commit, and records how it was built                                                                  | Yes        |
| Deploy  | Verifies that record, asks the host through AWS Systems Manager to run the commit, waits for `version` to be the commit from outside, and rolls back when it never is | No         |

The workflows are toolkit's, pinned to one commit of it in `.github/workflows/ci.yml`. Renovate proposes each new version of toolkit.

Once the deploy runs, the host reads `compose.yaml`, `compose.production.yaml` and `.env.production.example` from `main`. It starts PostgreSQL, runs the job `notifications-api-migrate` once, and then replaces the API with docker-rollout, which waits for the new container's health check and drains the old one.

## What production needs, once

None of these is in this repo, and none is done yet. The owner approves or does each of them once, before the first deploy.

| What                                                                                                                                                                         | Who                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| The repo's settings, its ruleset on `main` and its environment `production`, kept as code in `platform/infra/github`                                                         | The platform session, with the owner's approval of the plan |
| The deploy target `notifications` in `platform/infra/products.json`, which brings its command, its role and the address                                                      | The platform session, with the owner's approval of the plan |
| The repo secret `AWS_ACCOUNT_ID`                                                                                                                                             | The owner, in the repo's settings                           |
| `/notifications/POSTGRES_PASSWORD`, `/notifications/NOTIFICATIONS_API_DATABASE_PASSWORD` and `/notifications/NOTIFICATIONS_API_KEYS` in AWS Parameter Store, as SecureString | The owner                                                   |
| The image package made public, after the first publish, if GitHub created it as private                                                                                      | The owner, in the package's settings                        |

The service adds its own needs in the steps that build it: the mail password, its Kafka password and the access rules of its topics.

## Looking after it

| You want to                       | Do this                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| See what a merge published        | Open the run of the merge on GitHub. Publish names the image and its digest                                                                           |
| Know which version runs           | Once deployed, open <https://notifications.zigordev.com/health>. `version` is the commit                                                              |
| Read the logs, traces and metrics | Once deployed, Grafana Cloud, under the services `notifications-api` and `notifications-api-migrate`                                                  |
| Undo a bad version                | Once deployed, revert its pull request: the revert deploys like any merge                                                                             |
| Switch a flag                     | Change it in `apps/notifications-api/flags.json` in a pull request. The image carries the file, so the change goes live with the deploy of that merge |
| Run a deploy by hand              | Only with the owner's yes                                                                                                                             |
