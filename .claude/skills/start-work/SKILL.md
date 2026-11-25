---
name: start-work
description: Start a change in a zigordev repo. Checks that the folder is clean and on main, that commits and gh act as zigordev, then cuts the working branch from origin/main and installs. Use before the first edit of any task that will end in a commit.
---

# Start work

Run these steps in order, in the repo's own folder. Stop at the first one that fails, and say why.

1. **Look for anything that waits for the owner.** An infrastructure change, a migration that deletes data, a new tool or service, a new major version and a change to repo settings each need a yes first. Ask now, before building.
2. **Check the folder.** `git status --short --branch` must show `main` with nothing uncommitted. If it shows anything else, stop and ask. Never stash, commit or carry changes you did not make. Never work in a worktree or in a second copy of the repo.
3. **Check the identity.** `git config user.name` and `git config user.email` must print `zigordev` and `zigordev@gmail.com`. If either is missing or different, set both in this repo: `git config user.name zigordev` and `git config user.email zigordev@gmail.com`.
4. **Check the account.** `gh config get user -h github.com` must print `zigordev`. If it prints another account, run `gh auth switch -u zigordev` and say that you did.
5. **Branch.** Run `git fetch origin`, then `git switch -c <type>/<short-summary> origin/main`. The type is a Conventional Commits type, as in `fix/login-redirect`.
6. **Install.** Run `pnpm install`, so the dependencies match the lockfile and the git hooks are active.
7. **Read first.** Read the README and the docs of the area before changing its behaviour. Look at how the product template and the other repos already solve the same problem, and solve it the same way.
