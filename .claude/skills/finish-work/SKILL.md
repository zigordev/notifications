---
name: finish-work
description: Finish a change in a zigordev repo. Formats, runs the full check, commits, pushes, opens the pull request as a draft, marks it ready when it may merge, cleans up after the merge and reports. Use when the work of a task is written, and before saying that it is done.
---

# Finish work

Run these steps in order. Stop at the first one that fails, and say why.

1. **Tests and docs.** The change has the tests it needs, and the docs that describe the behaviour changed with it. A bug fix has a test that failed without the fix.
2. **Format, stage, check.** Run `pnpm format`, then `git add` the files of this change, then `pnpm check`. The order matters, because the hooks read the working tree and not the staged files. The check must pass, and it prints how long it took.
3. **Try it for real** when the change can be observed: run the app, send the request, open the page. Note what you did and what you saw.
4. **Read your own diff.** `git diff --cached` shows one concern, no comment, no secret, and nothing you did not mean to change.
5. **Commit** with a Conventional Commits title. The body says why the change was needed. A breaking change gets `!` after the type and a closing `BREAKING CHANGE:` line.
6. **Push the branch** with `git push -u origin <branch>`. Never push to `main`.
7. **Open the pull request as a draft**, with `gh pr create --draft`. Its title is the commit title, because a squash merge turns it into the commit. Its description has these sections: What, Why, How it was tested, Observability, Docs, Follow-ups.
8. **Wait for `check`.** A red check is yours to fix before anything else.
9. **Mark it ready, or leave it a draft.** Marking a pull request ready means: merge it when `check` is green. Do that with `gh pr ready` and then `gh pr merge --auto --squash`. Leave it a draft instead, and say why, when the change is one that waits for the owner.
10. **After the merge**, run `git switch main` and `git pull`, and delete the local branch. Stop every server, container and process you started.
11. **Report.** Say what changed, with the pull request link. Say how it was checked, and what was not checked. Say what needs the owner. Show the output of anything that failed.
