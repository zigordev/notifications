# 0001. Notifications starts from the API half of the template

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

toolkit's [record 0006](https://github.com/zigordev/toolkit/blob/main/docs/adr/0006-new-products-start-from-a-template.md) starts every new product as a copy of the product template in toolkit: an API on its own PostgreSQL with its migrate job, the API's typed client and its generator, and a web app. toolkit's records [0019](https://github.com/zigordev/toolkit/blob/main/docs/adr/0019-email-through-the-notifications-service.md) and [0042](https://github.com/zigordev/toolkit/blob/main/docs/adr/0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md) make notifications the one service that delivers the email of every product. Products send it request events over Kafka and read its outcome events, so it has no pages and no HTTP interface for products.

Step 5.1 of the Build plan reads: "notifications, started from the template's API half. This is the new-product skill's first real use". Its test is that the conformance check passes in the new repo. On 2026-11-25 the owner gave the go for the repo, in their words: "our OK to create the notifications repo, for phase 5". November's notifications service, kept in the backup of 2026-11-21, was built before the template existed, on older packages.

## Decision

- `zigordev/notifications` starts as the template's API half: the API, its migrate job and its PostgreSQL, the API's typed client and the client's generator, with the root files that every product repo has. The web app and its service are left out.
- The API answers at the product's whole address, `notifications.localhost` on the laptop and `notifications.zigordev.com` in production, because no web app shares it. `/health` at that address is the API's own.
- The template's example feature, the greeting and the notes, stays until the service replaces it. The client goes when the package of events arrives.
- Each later slice of the template that the service needs arrives as one pull request that copies it in.

## Consequences

- The repo has the shape, the checks and the pipeline of every product from its first commit. The next steps change only what makes it the notifications service.
- November's code is carried over into that shape, feature by feature, in step 5.2, instead of being copied in whole.
- The template's flag slice reads its flags through `@zigordev/flags`, which npm did not hold on 2026-11-25. It arrives in its own pull request once the package is published.
- A comparison with the template stays easy, because the files keep the template's names, renamed for the product.

## Alternatives considered

- **The whole template, as the playground has it.** The same start, plus a web app that a service with no pages would carry and keep up to date for nothing.
- **November's repo, carried over as it was.** A working service at once, but in a shape that predates the template, on packages and decisions that the restart of 2026-11-21 replaced.
- **An empty repo, with the pieces added by hand.** Nothing unused, but every piece that the template already wires and tests would be wired again, and the new-product skill would get no first use.
