# What a user can do with notifications

The users of notifications are the other apps of the platform. An app hands it an email to deliver, and learns what happened to it. Both travel over Kafka, through `@zigordev/events`, as toolkit's [record 0042](https://github.com/zigordev/toolkit/blob/main/docs/adr/0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md) says. No app calls the service over HTTP.

## Before an app sends its first email

An app needs four things, once. The first three are code in `platform`, and the fourth in this repo.

| What                                                                                                             | Where                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Its own Kafka user, named after the app, such as `playground-api`, with its password in Parameter Store          | `platform`, and the owner for the password                  |
| Its two topics: `notifications.requests.<app>` and `notifications.outcomes.<app>`, with their dead-letter topics | `platform`                                                  |
| The access rules: it may write its request topic and read its outcome topic, and nothing else                    | `platform`                                                  |
| Its entry in `apps/notifications-api/producers.json`: its name, and the addresses it may send from               | This repo, in a pull request that goes live with its deploy |

```json
{
  "producers": [
    { "app": "playground-api", "senders": ["no-reply@zigordev.com", "help@zigordev.com"] }
  ]
}
```

The first sender is the one the service uses when a request names none.

Today the file names one app: `template-api`, the API of toolkit's product template, which sends sign-in's emails from `no-reply@zigordev.com`. The template runs only on the laptop, so `platform` gives it its Kafka user and its rules there alone. Its four topics exist on every broker, the production one too, because the service reads the request topic of every app in this file, and a single missing topic stops it reading any of them.

## Send an email

Add the package of events beside `@zigordev/events`, and render the email with `@zigordev/email`. Write the request into the app's outbox, in the same transaction as the change it belongs to:

```ts
import { verifyEmail } from '@zigordev/email';
import { addToOutbox } from '@zigordev/events';
import { emailRequested, requestTopicOf } from '@zigordev/notifications-events';

await app.db.transaction(async (tx) => {
  const [user] = await tx.insert(users).values(signUp).returning();
  const email = verifyEmail({ lang: 'es', product: 'Playground', link: confirmationUrl });
  const request = await addToOutbox(tx, {
    topic: requestTopicOf('playground-api'),
    event: emailRequested,
    data: {
      to: { email: user.email, name: user.name },
      ...email,
      tags: { template: 'verify-email' },
    },
  });
  await tx.update(users).set({ verificationRequestId: request.id }).where(eq(users.id, user.id));
});
```

- The user and the request are saved together, or not at all. The relay of `@zigordev/events` sends the request once Kafka answers, so a request is never lost, even while the broker or the service is down.
- `addToOutbox` returns the event. Its `id` is the request's id: keep it to match the outcome later.
- The request's id is also its safe-retry key. The service accepts a request once, however often Kafka brings it, and sends its email once.

| Field     | Holds                                                                            | Rules                                           |
| --------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `to`      | The addressee: `email` and, if wanted, `name`                                    | Required                                        |
| `from`    | The sender: one of the app's senders in `producers.json`                         | Optional. Without it, the app's first sender    |
| `replyTo` | Where answers go                                                                 | Optional                                        |
| `subject` | The subject                                                                      | 1 to 998 characters, with no line break         |
| `html`    | The HTML body                                                                    | `html`, `text` or both                          |
| `text`    | The plain-text body                                                              | `html`, `text` or both                          |
| `tags`    | Up to 10 short labels kept with the email, such as the template and the language | Lower-case keys, values of up to 256 characters |

The whole request is at most 800,000 bytes as JSON, so that it fits in one Kafka message. A request that breaks a rule fails in the app's own `addToOutbox`, before anything is saved.

## Learn what happened

The service answers every request on the app's outcome topic, once the email is sent or has failed for good. Read it with a consumer of the app's own:

```ts
import { defineConsumer } from '@zigordev/events';
import { outcomeEvents, outcomeTopicOf } from '@zigordev/notifications-events';

defineConsumer({
  group: 'playground-api.email-outcomes',
  topics: [outcomeTopicOf('playground-api')],
  events: outcomeEvents,
  handle: async (event, { tx }) => {
    const sent = event.type === 'email.sent';
    await tx
      .update(users)
      .set({ verificationEmail: sent ? 'sent' : 'failed' })
      .where(eq(users.verificationRequestId, event.data.requestId));
  },
});
```

| Event          | Says                           | Fields                                                                          |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `email.sent`   | The mail server took the email | `requestId`, `sentAt`, `attempts`                                               |
| `email.failed` | The email will never be sent   | `requestId`, `failedAt`, `attempts`, `reason`, and `smtpCode` when there is one |

| `reason`              | Means                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `rejected`            | The mail server refused the email for good, with a 5xx reply, such as an unknown mailbox |
| `attempts_exhausted`  | Five tries were deferred with a 4xx reply                                                |
| `retry_limit_reached` | The queue's own limit of tries ran out, for a failure the rules above do not cover       |
| `sender_forbidden`    | The request named a sender the app may not use. Nothing was sent                         |

- An outcome names the request, never the address, the subject or the body.
- Sent means that the mail server took the email. With Amazon SES that is not proof that it arrived: bounces come later, through an SES event feed that nothing reads yet.
- While the mail server cannot be reached, the service holds every email, for as long as it takes. No outcome comes until it is sent or refused.
- A version 1 reader also reads a version 1 outcome that gained a field later, because the outcome schemas let unknown fields through. A change that removes or renames a field gets a new version.

## Ask whether it is well

`GET /health` at the service's address answers with its version and the state of each part it depends on: `db`, `flags`, `provider` (the mail server), `kafka` and `topics`. It answers 200 `ok`, 200 `degraded` while Kafka or the mail server is down, because the service still holds every request until they are back, and 503 `error` while its database is down or Kafka says a topic it reads is missing. The deploy and the platform's checks read it.

The owner hears of trouble without asking: an alert in `platform` fires when an email of your app fails for good, when emails wait in the queue for 15 minutes, when the mail server cannot be reached for 10 minutes, and when the service cannot be reached from outside. The README's [The alerts that watch it](../README.md#the-alerts-that-watch-it) lists them.

## Critical paths

There are no pages, so there are no browser tests. Each path above has tests against a real PostgreSQL, a real Kafka and a real Mailpit:

| Path                                                                 | Tests                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A request is delivered as rendered, and answered with `email.sent`   | `apps/notifications-api/src/features/emails/requests.db.test.ts`   |
| A request that arrives twice is sent once                            | The same file                                                      |
| A forbidden sender, and a message that is no request                 | The same file                                                      |
| Retries, failures for good, and a mail server that is down           | `apps/notifications-api/src/features/delivery/delivery.db.test.ts` |
| One trace from the request through the queue and SMTP to the outcome | `apps/notifications-api/src/main.e2e.db.test.ts`                   |
