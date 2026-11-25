# 0002. Requests and outcomes travel on topics named after the service

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

toolkit's [record 0042](https://github.com/zigordev/toolkit/blob/main/docs/adr/0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md), accepted on 2026-11-25, has every app send its email as a request event on a request topic of its own, and read an outcome event, sent or failed, on an answer topic of its own. The service skips a request it already has, by its id, and the outcome names the request, never the address. [Record 0041](https://github.com/zigordev/toolkit/blob/main/docs/adr/0041-each-app-signs-in-to-kafka-with-its-own-password.md) gives each app its own Kafka user, and access rules that let it write only its request topic and read only its answer topic. `platform` makes the topics and the rules as code. Those records leave the names of the topics, the fields of the events and the list of the apps that may send to this repo.

The main session of the platform's restart confirmed on 2026-11-25 that `platform`'s list of topics, users and rules takes these names as they are. The owner accepted this record the same day, in their words: "Accept 0002".

Facts that shaped the choices:

- Kafka's access rules match a topic by its whole name or by a prefix, never by a suffix.
- Kafka's default limit for one message is 1,048,588 bytes. A request carries the whole email.
- `@zigordev/events` gives each event a random id when it is saved in the outbox, sends it at least once, and lets a reader skip an id it handled in the last 30 days.
- November's service, in the backup of 2026-11-21, checked each caller's sender against a list, and kept the email row as the record of its request's key, with a unique index, for as long as the email exists.

## Decision

- An app's topics are named after the service first, then what they hold, then the app: `notifications.requests.<app>` and `notifications.outcomes.<app>`, where `<app>` is the app's Kafka user, such as `playground-api`. Their dead-letter topics add `.dead-letter`, as `@zigordev/events` does.
- The service reads every request topic as the user `notifications-api`, in the consumer group `notifications-api.requests`, and writes every outcome topic through its own outbox. Its access rules are three prefixed rules that never change when an app joins.
- The request is the event `email.requested`, version 1: `to`, an optional `from`, an optional `replyTo`, `subject`, `html` and `text` (one at least), and up to 10 `tags`. Its JSON is at most 800,000 bytes. Its schema is strict, so a misspelt field fails in the app that sends it.
- The outcomes are `email.sent` and `email.failed`, version 1. Each names the request's id and how many attempts were made. A failure adds its `reason` and the SMTP code, when there is one. Their schemas let an unknown field through, so a reader on version 1 keeps reading when a field is added.
- The request's id is its safe-retry key. The email row keeps it with a unique index on the producer and the id, for as long as the email exists, so a request that comes back after its 30 days in `events_handled` is still sent once.
- The apps that may send are listed in `apps/notifications-api/producers.json`, each with the addresses it may send from. A request without `from` uses the app's first sender. A request from another address fails at once with `email.failed`, reason `sender_forbidden`, and nothing is sent.
- The events and the topic names live in `@zigordev/notifications-events`, in this repo, and the service uses the same package as every app.

## Consequences

- An app joins with its Kafka user, its two topics and their rules in `platform`, and one line in `producers.json`, which goes live with the service's deploy.
- A request that breaks the schema fails in the app's own transaction, before anything is saved, so a bad request never blocks the app's outbox.
- A message on a request topic can only come from its app, so the producer is known from the topic, with no key in the message.
- Changing a field that already exists means a new version of the event, which the service reads beside the old one until no app sends the old one.
- The list of producers lives in two places: the topics and rules in `platform`, the senders here. A producer missing from either sends nothing: its requests wait in Kafka until both exist.

## Alternatives considered

- **Topics named after the app first**, such as `playground-api.email.requests`. Each app's rules become one prefix, but the service needs two new rules for every app that joins.
- **One request topic for every app.** Fewer topics, but the topic no longer proves the sender, so every app could send as any other, which record 0041 rules out.
- **A key chosen by the app in the request**, as November's `Idempotency-Key` header was. The outbox already sends each saved request once, with its own id, so a second key would only repeat it.
- **The sender always chosen by the service.** Simpler requests, but an app with a support address and a no-reply address could not use both.
