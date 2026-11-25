# 0003. Delivery carries over November's SMTP path, outcomes and retries

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

Step 5.2 of the Build plan reads: "November's code, carried over: accepting an email with its safe-retry key, the queue, SMTP delivery, outcomes and retries, and deleting message bodies after 30 days". The owner approved the plan, and the brief of 2026-11-25 for this step repeats it. November's service, in the backup of 2026-11-21, recorded its delivery decisions in its own records, which the owner accepted on 2026-11-19: SMTP for every environment (its 0003), the outcomes and retries (its 0005), and one process that serves and delivers, with a migrate job (its 0006). Its tests reached every outcome against a real Mailpit, whose chaos mode answers chosen SMTP codes. Its `/health` answered 503 while the mail server was down.

The platform has since grown two rules that touch that last point. The contract check, `pnpm check:contract`, starts the product on its own, with no shared service, and needs it healthy. And a part outside the product, such as Kafka in `@zigordev/events`, makes `/health` answer `degraded`, not `error`, because the app still holds its work while that part is away.

The owner accepted this record on 2026-11-25, in their words: "Accept 0003".

The legacy service before November retried mail four times and set it aside when Google revoked its Gmail password, instead of waiting. toolkit's handbook lists pg-boss for background jobs and nodemailer for the notifications service's SMTP.

## Decision

- One SMTP adapter on nodemailer sends every email: to Mailpit on the laptop and in the tests, to Amazon SES's SMTP endpoint with STARTTLS on port 587 in production. Only the host, the port, the security and the sign-in differ.
- Accepting a request and queuing its delivery job in pg-boss happen in one transaction, in the service's own PostgreSQL. The job and the email never exist one without the other.
- Each attempt is recorded with one outcome, which decides what follows:

| Outcome                | Comes from                                                                                     | Then                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `sent`                 | The provider took the message                                                                  | The email is sent, and `email.sent` goes out                                          |
| `deferred`             | A 4xx reply, or a failure nobody recognises                                                    | Tried again after 30 seconds, growing up to 300. The fifth deferral fails it for good |
| `rejected`             | A 5xx reply, or a message nodemailer cannot build                                              | Failed for good at once                                                               |
| `provider_unavailable` | No connection, a timeout, a TLS or protocol failure, or the replies 421, 454, 530, 534 and 535 | Delivery pauses, `/health` answers `degraded`, and the attempt is not counted         |

- A monitor asks the provider whether it is up at the start and every 30 seconds, and delivery resumes when it answers. While it is down, no email is attempted and none fails.
- The provider is an optional part of `/health`, as Kafka is: while it is down, `/health` answers 200 `degraded` with `provider` down, where November's service answered 503. Only the database, which the product holds, makes it answer 503.
- An email that fails for good goes to the queue `email-dead-letters`, whose worker marks it failed and sends `email.failed` with the reason: `rejected`, `attempts_exhausted` or `retry_limit_reached`, the last when pg-boss's own limit of 20 tries runs out.
- The new status of the email and its outcome event are written in one transaction, through `@zigordev/events`' outbox.
- One process serves the health route, reads Kafka and delivers. The migrate job applies the migrations, installs pg-boss's schema and creates its three queues and its schedule. The service starts pg-boss without changing its schema, and refuses to start when a queue is missing.

## Consequences

- The production path runs on the laptop and in every test, against a real SMTP server.
- An outage of the mail server of any length fails no email. It shows as `provider` down in `/health`, a `provider.unavailable` log line and a queue that grows. The alert of step 5.6 reads those, since the container stays healthy and a deploy can still go out, for example the one that fixes a wrong mail setting.
- A message the server keeps deferring fails after five tries, in roughly 8 to 12 minutes.
- An email can be sent twice only when the process dies between the provider taking it and the attempt being recorded.
- SES features that SMTP cannot reach, such as tags on the call, need an API adapter behind the same interface.

## Alternatives considered

- **An SES API adapter in production, with SMTP only on the laptop.** Richer errors, but the production path would never run before it reached production.
- **Letting pg-boss count every failure.** Simpler, but an outage would fail mail, as the legacy service did.
- **A separate container for the worker.** Independent scaling, and twice the deployments, for a handful of emails a day.
- **The provider as a required part, as in November.** A deploy would wait for the mail server, and the contract check could never pass, because it runs the product with no mail server.
