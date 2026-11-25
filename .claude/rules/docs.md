---
paths:
  - "docs/**"
  - "**/README.md"
---

# Documentation rules

These rules apply to every README and to everything under `docs/`.

## The five places

| File                         | The question it answers                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `README.md`                  | What is this, why does it exist, what is it built with, and how do I start it in five minutes? |
| `docs/local-first-start.md`  | How do I run it on a clean laptop, step by step?                                               |
| `docs/cloud-first-deploy.md` | How does it reach production, and how do I operate it there?                                   |
| `docs/user-manual.md`        | What can a user do, flow by flow? For a library: how do I use it from my code?                 |
| `docs/adr/`                  | Which decisions were taken, and why? One short record each                                     |

The `docs` rule of `zigordev check` fails when one of them is missing.

## How to write

- Write for a reader who has never seen the repo, and teach: say what a thing is, why it exists and how to use it.
- A pull request that changes behaviour changes its docs too.
- Update the page that exists. Do not add a summary, a report or notes that nobody asked for.
- Dates are absolute, such as 2026-11-22, never "yesterday".
- A diagram is a Mermaid code block, which GitHub draws.
- A link to another file leads somewhere. The `links` rule fails when one does not, and markdownlint keeps the Markdown consistent.
- The user manual of a web app lists its critical paths, and each one has a browser test.

## Handbook pages

`toolkit` holds the handbook in `docs/handbook/`, with one page per piece of the platform. Every page has the same five headings:

1. What it is.
2. Why we have it, and what we would lose without it.
3. How it works here, on the laptop and in production.
4. How to use it, with one worked example.
5. How to check that it works, and what to do when it does not.

A package's README follows the same five headings. `platform` holds the runbooks in `docs/runbooks/`, and every alert links to one.

## Decision records

- One short record per significant decision: the context, the decision, the consequences and the alternatives not taken.
- Records are numbered from 0001 in each repo. An accepted record is never edited: a new record supersedes it by naming it.
- The `write-decision-record` skill holds the template and the steps.
