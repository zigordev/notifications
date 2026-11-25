# Core rules

These rules hold in every zigordev repo and in every session. `toolkit` owns this file. Every other repo holds a copy, `zigordev sync` updates it, and `pnpm check` fails when a copy differs. A repo's own `CLAUDE.md` adds detail. When the two disagree, stop and ask.

## The rules

1. **Identity.** Every commit is authored and committed as `zigordev <zigordev@gmail.com>`, and `gh` acts as `zigordev`. The one exception is a text changed in Fink, the editor for translators: a commit that changes only files in a `messages/` folder keeps its translator as author.
2. **No attribution.** Nothing credits a tool or a co-author: no `Co-Authored-By` trailer, no "Generated with" line, no line that names Claude or another AI tool as an author, and no robot emoji. This covers commits, pull requests, issues, comments, release notes, code and docs. The one exception is a line that nobody writes: when GitHub squashes a pull request that Renovate opened, it adds a co-author line for Renovate. The `attribution` rule of `zigordev check` accepts that line on Renovate's own commits, and nowhere else. Fink adds a co-author line of its own, which names Fink and its address at inlang.com, and the same rule accepts that line on a commit that changes only files in a `messages/` folder, and nowhere else.
3. **No comments.** No file gets a comment of any kind. The reasoning goes in the commit body, the pull request, the docs or a decision record. A line that a tool needs is not a comment: a shebang, a `# syntax=` line, the version label after a pinned action, and a suppression that cannot be avoided, which the pull request names.
4. **Protected history.** Nothing is pushed to `main`. The git hooks are never skipped. A force push goes only to your own working branch.
5. **One format.** Commits and pull request titles follow Conventional Commits: `type(scope): summary`, in lower case, with no final period.
6. **Done means checked.** `pnpm check` passes before a push, because it runs what CI runs. A change that can be observed is also tried for real.
7. **Some changes wait for the owner.** They are listed below. Every other change merges by itself once `check` is green.

## What waits for the owner

Ask in the conversation and wait for a clear yes before any of these. A yes covers one action, not the next one.

- An infrastructure change. The plan shows in the pull request, and the apply waits for the owner's approval in GitHub. Nothing in AWS, Cloudflare, GitHub or Grafana is changed by hand.
- A migration that deletes data. The owner lets it through by adding the label `destructive-migration` to its pull request. A session never adds that label.
- A tool, library or service the handbook does not list yet. Propose it with the reason, the alternatives, the licence and the price.
- A new major version of a dependency.
- A repo's settings and rulesets, and creating or deleting a repo.
- Deleting data, and running a deploy, a rollback or a pipeline job by hand.
- A message on a pull request or an issue that the task is not about.

Two things a session never does, even with a yes: it never sets, rotates or deletes a secret or a variable, and it never approves a pull request or a deployment. Say exactly what is needed, and the owner does it.

## What enforces each rule

| Rule                             | Enforced by                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                         | The guard hook, before a commit, a push and a change made with `gh`. The `identity` rule of `zigordev check`, in the commit hook and in CI on the pull request's commits                                                                                            |
| No attribution                   | The guard hook, on commit messages and on text sent with `gh`. commitlint, on every commit message and on the pull request title. The `attribution` rule of `zigordev check`, in CI on the pull request's title, description and commits                            |
| No comments                      | The `comments` rule of `zigordev check`: after a file is written, in the commit hook and in CI                                                                                                                                                                      |
| Protected history                | GitHub's ruleset on `main`, the push hook and the guard hook                                                                                                                                                                                                        |
| One format                       | commitlint in the commit hook, and the `Title` job in CI                                                                                                                                                                                                            |
| Done means checked               | The push hook runs `pnpm check:quick`, and `check` is the one required check on `main`                                                                                                                                                                              |
| Infrastructure waits             | From phase 3, the apply job waits for the owner's approval in GitHub. The guard hook already refuses to give an approval, and the permission rules ask before an apply                                                                                              |
| A flag carries a removal date    | The `flags` rule of `zigordev check`, in `pnpm check` and in CI: it fails on a flag in a `flags.json` without `metadata.removeBy`, and on one past that date                                                                                                        |
| A destructive migration waits    | The `migrations` rule of `zigordev check`. In CI it fails on a migration that the pull request adds and that deletes data, until the pull request has the owner's label `destructive-migration`. On the laptop it warns. The guard hook asks before a label changes |
| Settings, secrets and repos wait | The permission rules in `.claude/settings.json` ask before a repo, a release or a workflow run is created or changed, and refuse to set a secret. The guard hook asks before any change made through GitHub's API                                                   |

## How work flows

- Work happens in the repo's own folder, on one working branch per change. There is no worktree and no second copy of a repo.
- A branch is named `<type>/<short-summary>`, is cut from `origin/main`, lives for hours and holds one concern.
- A pull request opens as a draft. Marking it ready means: merge it when `check` is green. Merges are squashes, so the title becomes the commit.
- Unfinished work ships switched off, behind a flag that carries a removal date.
- A red `main` is fixed or reverted before any other work.
- The `start-work` skill begins a change, and the `finish-work` skill ends it.

## Everywhere

- Same thing, same way. Before building something, look at how the product template and the other repos do it, and do it that way. To change the way, change it in `toolkit`, for everyone.
- One tool per job. The handbook in `toolkit` lists the tools.
- Stable versions only. A new major version waits a month and arrives as its own task.
- English in code, commits and docs. Dates are absolute, such as 2026-11-22.
- Secrets and personal data never reach git, logs, metrics, traces or error messages.
- Never stop, recreate or reconfigure a container you did not start. Stop every server, container and process you started before you finish.

## Done

A change is done when all of this holds:

1. `pnpm check` passes, and the change was tried for real when it can be observed.
2. Tests cover the new behaviour: unit, API and browser tests, where each applies.
3. The docs that describe the behaviour changed in the same pull request.
4. The change can be seen when it runs: its logs, metrics and traces use the standard names, and a new failure a user would notice has an alert with a runbook.
5. The pull request is a draft or is green, and nothing that waits for the owner was done without a yes.

The report says what changed, with links, how it was checked, what was not checked and what needs the owner. It shows the output of anything that failed.
