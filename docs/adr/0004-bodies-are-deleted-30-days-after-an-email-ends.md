# 0004. Bodies are deleted 30 days after an email ends

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

The service stores the HTML and the text of every email, so that it can send and retry it. Once an email is sent, or has failed for good, nothing reads them again: no route returns a body, and a request that comes back is matched by its id. The bodies are the most personal part of an email, such as a reset link or a visitor's message.

Step 5.2 of the Build plan, which the owner approved, carries over November's "deleting message bodies after 30 days". November's record 0009, accepted by the owner on 2026-11-19, ran it as a daily pg-boss schedule. The platform's data rules ask that deleted data leave every backup within 30 days, and run schedules in pg-boss, in the product's own database.

## Decision

- Every day at 03:17 UTC, a pg-boss schedule on the queue `email-retention` sets the HTML and the text to null on every email sent or failed more than `EMAIL_BODY_RETENTION_DAYS` before, 30 by default.
- The addresses, the subject, the tags, the times, the request's id and every attempt stay.
- An email still queued keeps its bodies, however old it is, so a long outage of the mail server loses no mail.
- The migrate job creates the queue and the schedule, which runs once at the next start when the service was down at 03:17. The service logs `email.bodies_deleted` with the count, or `email.retention_failed`, after which pg-boss tries again.

## Consequences

- After 30 days the service can still say whether an email was sent, to whom and with which subject, but no longer what it said.
- The requests in Kafka hold the bodies too, for as long as the topics keep their messages. `platform` sets that retention below 30 days.
- An alert on a day without `email.bodies_deleted` shows a schedule that stopped. It comes with the runbooks of step 5.6.

## Alternatives considered

- **Deleting the whole row.** It removes the trail and the record of the request's id with it.
- **Also blanking the subject and the addresses.** More privacy, but nobody could say any more whether an email reached someone.
- **A timer inside the process.** No record of its runs, and every copy of the service would run it.
