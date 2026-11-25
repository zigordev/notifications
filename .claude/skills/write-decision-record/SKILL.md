---
name: write-decision-record
description: Write a decision record (ADR) in docs/adr. Use when a change adds, removes or replaces a tool, a service, a data store, a provider, a deploy path or a public interface, or when the owner takes a decision that a later reader will ask about.
---

# Write a decision record

A decision record is one short page that says what was decided and why, for a reader who was not there.

1. **Find the number.** List `docs/adr/`. The new record takes the next free four-digit number. Numbers start at 0001 in each repo.
2. **Copy the template.** Copy [template.md](template.md), which sits beside this file, to `docs/adr/NNNN-short-title.md`. The title is a short statement of the decision, and the file name repeats it in kebab-case.
3. **Fill it in**, in this order:
   - **Context**: the problem, the facts, and what went wrong before. Give numbers and absolute dates.
   - **Decision**: what we do, stated as a rule someone can check.
   - **Consequences**: what becomes easier, what becomes harder, and what has to change elsewhere.
   - **Alternatives considered**: each option not taken, and why. Give the price of any paid option.
4. **Set the status.** A record is `proposed` in its pull request and `accepted` once the owner has agreed. Only the owner takes a decision: put the options to them one at a time, with the pros and cons of each.
5. **Supersede, never edit.** An accepted record is not edited. A new record names the one it replaces under `Supersedes`, and the index marks the old one as superseded.
6. **Add it to the index** in `docs/adr/README.md`, in the same pull request.
7. **Keep it to one page.** Details belong in the handbook or the docs, and the record links to them.
