---
paths:
  - ".github/**"
---

# Workflow rules

These rules apply to everything under `.github/`.

- An action is pinned to a full commit SHA, with its exact version beside it, such as `# v7.0.1`. The `actions` rule of `zigordev check` fails anything else, and Renovate keeps the pins current.
- A workflow starts with `permissions: {}`. Each job then gets the least it needs, and a `timeout-minutes`.
- A value from `${{ }}` reaches a script through `env`, never inline in `run:`.
- Repos, logs and artifacts are public. Nothing secret is printed, and a job that needs AWS signs in with GitHub's short-lived credentials, never with a stored key.
- `check` is the one required check, with the same name in every repo. It passes only when every job passed. Never rename it, and never rename or remove a job without saying that the ruleset depends on it.
- The pipeline lives in `toolkit` as reusable workflows. A repo's own workflow is a short caller, pinned to a commit of `toolkit` like any action.
- The pipeline runs what `pnpm check` runs on the laptop. A check that exists only in CI is one that only GitHub can run, such as the scan of the code.
- In a shell step, fetch once into a variable and test the variable. Never pipe `curl` into `grep -q`, which fails under `pipefail`.
- `zizmor` lints every workflow inside `pnpm check`. A finding is fixed, not suppressed.
- A workflow that deploys, publishes or applies infrastructure is never dispatched or run again by hand without the owner's yes.
