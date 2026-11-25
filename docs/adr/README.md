# Decision records

Each significant decision about this repo gets one short record: the context, the decision, its consequences and the alternatives that were not taken. A record is written for a reader who was not there.

The records are numbered from 0001. An accepted record is never edited: a new record supersedes it by naming it, and this index then marks the old one as superseded.

The decisions that shape the whole platform are not here. They are recorded once, [in toolkit](https://github.com/zigordev/toolkit/blob/main/docs/adr/README.md). A record here that follows from one there names it and does not repeat it.

To add one, use the `write-decision-record` skill, or copy [its template](../../.claude/skills/write-decision-record/template.md) to `NNNN-short-title.md` with the next free number, and add a row here in the same pull request.

| #                                                                      | Decision                                               | Date       | Status   |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | ---------- | -------- |
| [0001](0001-notifications-starts-from-the-api-half-of-the-template.md) | Notifications starts from the API half of the template | 2026-11-25 | accepted |
