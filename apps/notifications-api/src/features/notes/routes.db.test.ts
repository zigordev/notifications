import { randomUUID } from 'node:crypto';
import { createLogger } from '@zigordev/otel';
import { captureLogs, expectProblem, useApp } from '@zigordev/test/app';
import { useTestDatabase } from '@zigordev/test/postgres';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { buildApp } from '../../app.ts';
import { readConfig } from '../../config.ts';
import { hashKey } from '../../plugins/api-keys.ts';

const writer = randomUUID();
const reader = randomUUID();
const stranger = randomUUID();
const database = useTestDatabase();
const logs = captureLogs();
const server = useApp(() =>
  buildApp({
    config: readConfig({
      OTEL_SERVICE_NAME: 'notifications-api',
      DATABASE_URL: database.url,
      API_KEYS: JSON.stringify([
        { name: 'writer', sha256: hashKey(writer), scopes: ['notes:read', 'notes:write'] },
        { name: 'reader', sha256: hashKey(reader), scopes: ['notes:read'] },
        { name: 'stranger', sha256: hashKey(stranger), scopes: [] },
      ]),
    }),
    logger: createLogger({ service: 'notifications-api', destination: logs }),
  })
);

const as = (key: string) => ({ authorization: `Bearer ${key}` });
const missing = '0190d4c2-0000-7000-8000-000000000000';

interface Note {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

async function create(note: Record<string, unknown>): Promise<Note> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/api/v1/notes',
    headers: as(writer),
    payload: note,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as Note;
}

async function clear(): Promise<void> {
  await server.app.db.execute(sql`DELETE FROM notes`);
}

describe('POST /api/v1/notes', () => {
  it('creates a note with 201, its address, and the defaults it did not name', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      headers: as(writer),
      payload: { title: '  Buy milk  ' },
    });

    expect(response.statusCode).toBe(201);
    const note = response.json() as Note;
    expect(response.headers.location).toBe(`/api/v1/notes/${note.id}`);
    expect(note).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: 'Buy milk',
      body: '',
      status: 'open',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      updatedAt: note.createdAt,
    });
    expect(logs.find('note.created')).toEqual([expect.objectContaining({ noteId: note.id })]);
  });

  it('answers 400 and names every invalid field', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      headers: as(writer),
      payload: { title: '', status: 'later', colour: 'red' },
    });

    const problem = expectProblem(response, { status: 400, code: 'request.invalid' });
    expect(problem.params.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'body', pointer: '/title' }),
        expect.objectContaining({ in: 'body', pointer: '/status' }),
        expect.objectContaining({ in: 'body', pointer: '/colour', code: 'unrecognized_key' }),
      ])
    );
  });

  it('answers 401 without a key, and 403 to a key that may only read', async () => {
    const anonymous = await server.app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      payload: { title: 'x' },
    });
    const readOnly = await server.app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      headers: as(reader),
      payload: { title: 'x' },
    });

    expectProblem(anonymous, { status: 401, code: 'auth.unauthenticated' });
    const problem = expectProblem(readOnly, { status: 403, code: 'auth.forbidden' });
    expect(problem.params).toEqual({ scope: 'notes:write' });
  });
});

describe('GET /api/v1/notes/{noteId}', () => {
  it('answers 200 with the note', async () => {
    const note = await create({ title: 'Read me', body: 'Some text' });

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/notes/${note.id}`,
      headers: as(reader),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(note);
  });

  it('answers 404 with the id it looked for', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/notes/${missing}`,
      headers: as(reader),
    });

    const problem = expectProblem(response, {
      status: 404,
      code: 'note.not_found',
      instance: `/api/v1/notes/${missing}`,
    });
    expect(problem.params).toEqual({ noteId: missing });
  });

  it('answers 400 to an id that is no UUID, and 401 without a key', async () => {
    const invalid = await server.app.inject({
      method: 'GET',
      url: '/api/v1/notes/42',
      headers: as(reader),
    });
    const anonymous = await server.app.inject({ method: 'GET', url: `/api/v1/notes/${missing}` });

    expectProblem(invalid, { status: 400, code: 'request.invalid' });
    expectProblem(anonymous, { status: 401, code: 'auth.unauthenticated' });
  });
});

describe('PATCH /api/v1/notes/{noteId}', () => {
  it('changes the fields it names, and the time of the change', async () => {
    const note = await create({ title: 'Draft' });

    const response = await server.app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${note.id}`,
      headers: as(writer),
      payload: { status: 'done' },
    });

    expect(response.statusCode).toBe(200);
    const changed = response.json() as Note;
    expect(changed).toMatchObject({ id: note.id, title: 'Draft', status: 'done' });
    expect(changed.updatedAt >= note.updatedAt).toBe(true);
  });

  it('answers 400 to a change that names no field, or a field it does not know', async () => {
    const note = await create({ title: 'Draft' });

    const empty = await server.app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${note.id}`,
      headers: as(writer),
      payload: {},
    });
    const unknown = await server.app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${note.id}`,
      headers: as(writer),
      payload: { owner: 'me' },
    });

    expectProblem(empty, { status: 400, code: 'request.invalid' });
    expectProblem(unknown, { status: 400, code: 'request.invalid' });
  });

  it('answers 404 for a note that does not exist, and 403 to a reader', async () => {
    const absent = await server.app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${missing}`,
      headers: as(writer),
      payload: { title: 'x' },
    });
    const readOnly = await server.app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${missing}`,
      headers: as(reader),
      payload: { title: 'x' },
    });

    expectProblem(absent, { status: 404, code: 'note.not_found' });
    expectProblem(readOnly, { status: 403, code: 'auth.forbidden' });
  });
});

describe('DELETE /api/v1/notes/{noteId}', () => {
  it('deletes the note with 204 and no body, after which it is gone', async () => {
    const note = await create({ title: 'Delete me' });

    const response = await server.app.inject({
      method: 'DELETE',
      url: `/api/v1/notes/${note.id}`,
      headers: as(writer),
    });
    const after = await server.app.inject({
      method: 'GET',
      url: `/api/v1/notes/${note.id}`,
      headers: as(reader),
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(after.statusCode).toBe(404);
    expect(logs.find('note.deleted')).toEqual([expect.objectContaining({ noteId: note.id })]);
  });

  it('answers 404 for a note that does not exist, 403 to a reader and 401 without a key', async () => {
    const absent = await server.app.inject({
      method: 'DELETE',
      url: `/api/v1/notes/${missing}`,
      headers: as(writer),
    });
    const readOnly = await server.app.inject({
      method: 'DELETE',
      url: `/api/v1/notes/${missing}`,
      headers: as(reader),
    });
    const anonymous = await server.app.inject({
      method: 'DELETE',
      url: `/api/v1/notes/${missing}`,
    });

    expectProblem(absent, { status: 404, code: 'note.not_found' });
    expectProblem(readOnly, { status: 403, code: 'auth.forbidden' });
    expectProblem(anonymous, { status: 401, code: 'auth.unauthenticated' });
  });
});

describe('GET /api/v1/notes', () => {
  beforeEach(async () => {
    await clear();
  });

  async function list(query: string, key = reader) {
    return server.app.inject({ method: 'GET', url: `/api/v1/notes${query}`, headers: as(key) });
  }

  it('lists the newest first, 20 at a time, with a cursor while there are more', async () => {
    for (let index = 0; index < 22; index += 1) {
      await create({ title: `note ${String(index).padStart(2, '0')}` });
    }

    const first = (await list('')).json() as { items: Note[]; nextCursor?: string };
    const second = (await list(`?cursor=${first.nextCursor}`)).json() as {
      items: Note[];
      nextCursor?: string;
    };

    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.title).toBe('note 21');
    expect(second.items.map((note) => note.title)).toEqual(['note 01', 'note 00']);
    expect(second).not.toHaveProperty('nextCursor');
  });

  it('filters by status, and sorts by title in both orders', async () => {
    await create({ title: 'b' });
    await create({ title: 'a', status: 'done' });
    await create({ title: 'c', status: 'done' });

    const done = (await list('?status=done&sort=title')).json() as { items: Note[] };
    const reversed = (await list('?sort=-title')).json() as { items: Note[] };

    expect(done.items.map((note) => note.title)).toEqual(['a', 'c']);
    expect(reversed.items.map((note) => note.title)).toEqual(['c', 'b', 'a']);
  });

  it('answers 400 to an unknown filter, an unknown sort field and a limit over 100', async () => {
    for (const query of ['?owner=me', '?sort=owner', '?limit=101']) {
      expectProblem(await list(query), { status: 400, code: 'request.invalid' });
    }
  });

  it('answers 401 without a key, 403 to a key without the scope, and lets a reader list', async () => {
    const anonymous = await server.app.inject({ method: 'GET', url: '/api/v1/notes' });

    expectProblem(anonymous, { status: 401, code: 'auth.unauthenticated' });
    const problem = expectProblem(await list('', stranger), {
      status: 403,
      code: 'auth.forbidden',
    });
    expect(problem.params).toEqual({ scope: 'notes:read' });
    expect((await list('')).statusCode).toBe(200);
  });

  it('keeps the notes whose title holds the text of q, in any case, and reads % and _ as text', async () => {
    await create({ title: 'Buy MILK' });
    await create({ title: 'milkshake' });
    await create({ title: 'Bread' });
    await create({ title: '100% done' });
    await create({ title: '1000 done' });

    const milk = (await list('?q=milk&sort=title')).json() as { items: Note[] };
    const percent = (await list('?q=0%25&sort=title')).json() as { items: Note[] };

    expect(milk.items.map((note) => note.title)).toEqual(['Buy MILK', 'milkshake']);
    expect(percent.items.map((note) => note.title)).toEqual(['100% done']);
  });

  it('answers 400 to an empty q, and to a q over 100 characters', async () => {
    for (const query of ['?q=', `?q=${'a'.repeat(101)}`]) {
      const problem = expectProblem(await list(query), { status: 400, code: 'request.invalid' });
      expect(problem.params.errors).toEqual([expect.objectContaining({ pointer: '/q' })]);
    }
  });
});

describe('GET /health', () => {
  it('answers 200 ok with the database up, and names its version', async () => {
    vi.stubEnv('OTEL_SERVICE_VERSION', '1f3a9c2');
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const response = await server.app.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({
      status: 'ok',
      service: 'notifications-api',
      version: '1f3a9c2',
      components: { db: { status: 'up' }, flags: { status: 'up' } },
    });
  });
});
