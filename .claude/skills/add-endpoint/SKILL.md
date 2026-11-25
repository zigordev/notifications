---
name: add-endpoint
description: Add an endpoint to an API app built on @zigordev/api. Writes the schemas, the repository, the service and the route, the API tests on a real database, and the OpenAPI file. Use for every new route, and for a change to one.
---

# Add an endpoint

An endpoint is one method on one path, such as `POST /api/v1/notes`. The API rules in `.claude/rules/api.md` say how it is named and what it answers. Each feature keeps its files together in `src/features/<feature>/`.

1. **Name it.** A plural noun in kebab-case under `/api/v1/`, nested at most two levels. `GET` answers 200, a `POST` that creates 201 with a `Location`, `PATCH` 200 with the resource, and `DELETE` 204. Its `operationId` is camelCase, such as `createNote`, and never changes.
2. **Describe what it takes and gives** in `schemas.ts`, with Zod. Every body, query and path parameter is a strict object, so an unknown field is a 400. A list takes its query from `listQuery` and answers with `pageSchema`. Answers use camelCase, UUIDs and ISO 8601 timestamps.
3. **Query the data** in `repository.ts`, with Drizzle and nothing else. A list pages by keyset with `afterCursor` and `keysetOrder`, and asks for one row more than its limit.
4. **Keep the rules** in `service.ts`. It turns rows into answers, and throws the errors of `@zigordev/api`, such as `notFound('note.not_found', ...)`, with a stable code in `area.what` form.
5. **Add the route** in `routes.ts`, inside the feature's plugin: a `summary`, `tags`, the `operationId`, its schemas, and every status it can answer, with `problemResponses(400, 401, 403, 404)`. It calls `requireScope` first, unless it is marked `config: { public: true }`. It logs a business event, such as `note.created`, with ids only.
6. **Test it** in `routes.db.test.ts`, on a real PostgreSQL through `@zigordev/test`: success, 400 naming every invalid field, 401 without credentials, 403 without the scope, 404 for what does not exist, each error body checked with `expectProblem`.
7. **Write the OpenAPI file** again with `pnpm --dir <app folder> run openapi`. The drift test fails until the committed `openapi.json` matches the code. A client generated from it is regenerated in the same pull request.
8. **Finish** with the `finish-work` skill.
