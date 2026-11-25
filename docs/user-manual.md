# What a user can do with notifications

The users of notifications are the other products: each one will hand it an email to send and learn what happened to it. That arrives with the service, over Kafka, in the next steps of phase 5. Today the API holds the template's example feature, and this page lists what a caller can do with it, flow by flow.

## A caller of the API

A caller signs in with an API key in `Authorization: Bearer <key>`. Each key has scopes: `notes:read` to read, and `notes:write` to change. The keys' digests live in the setting `API_KEYS`, and in production in the secret `NOTIFICATIONS_API_KEYS`, which the owner sets.

| Flow                     | Request                         | Answer                                                                                                       |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Ask whether it is well   | `GET /health`                   | JSON with `status`, the service's name, the `version` that runs, and the state of its database and its flags |
| Read the greeting        | `GET /api/v1/hello`             | 200 with a message, with no key. The flag `friendly-greeting` picks its words                                |
| List notes               | `GET /api/v1/notes`             | 200 with a page of notes, filtered by `status` and `q`, sorted and paged                                     |
| Write a note             | `POST /api/v1/notes`            | 201 with the note and its `Location`                                                                         |
| Read one note            | `GET /api/v1/notes/{noteId}`    | 200 with the note, or 404                                                                                    |
| Change a note            | `PATCH /api/v1/notes/{noteId}`  | 200 with the changed note, or 404                                                                            |
| Delete a note            | `DELETE /api/v1/notes/{noteId}` | 204, or 404                                                                                                  |
| Read the API's own pages | `GET /api/v1/docs`              | The OpenAPI pages, with every request and every error                                                        |

Every error is a problem in the platform's format: `type`, `title`, `status`, `detail`, `instance`, and a stable `code` with its `params`. The [README](../README.md) shows how to make a key on the laptop.

## What comes with the service

| Flow                | How a product will do it                                                            |
| ------------------- | ----------------------------------------------------------------------------------- |
| Send an email       | Render it with `@zigordev/email`, and send a request event on its own request topic |
| Learn what happened | Read the outcome event on its own answer topic: sent, or failed after the retries   |

toolkit's [record 0042](https://github.com/zigordev/toolkit/blob/main/docs/adr/0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md) describes both. This page lists them in full when they exist.

## Critical paths

The health route is the critical path today: the deploy and the platform's checks read it. It reports the database and the flags. It is tested on its own, as part of the API's routes on a real PostgreSQL, and in the API run as a real process.
