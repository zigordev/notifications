import { randomUUID } from 'node:crypto';
import { type AddressInfo, createServer } from 'node:net';
import { createLogger } from '@zigordev/otel';
import { useTestDatabase } from '@zigordev/test/postgres';
import { hashKey } from 'notifications-api/src/plugins/api-keys.ts';
import { type Server, start } from 'notifications-api/src/start.ts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNotificationsApiClient, type NotificationsApiClient } from './index.ts';

const key = randomUUID();
const database = useTestDatabase();
let server: Server;
let client: NotificationsApiClient;

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

beforeAll(async () => {
  const port = await freePort();
  server = await start({
    env: {
      OTEL_SERVICE_NAME: 'notifications-api',
      DATABASE_URL: database.url,
      HOST: '127.0.0.1',
      PORT: String(port),
      API_KEYS: JSON.stringify([
        { name: 'client', sha256: hashKey(key), scopes: ['notes:read', 'notes:write'] },
      ]),
    },
    logger: createLogger({ service: 'notifications-api', destination: { write: () => true } }),
  });
  client = createNotificationsApiClient({ baseUrl: `http://127.0.0.1:${port}`, key });
});

afterAll(async () => {
  await server.stop('SIGTERM');
});

describe('the client against the running API', () => {
  it('creates a note, finds it in the list, and reads it back', async () => {
    const created = await client.POST('/api/v1/notes', { body: { title: 'From the client' } });
    const id = created.data?.id ?? '';

    const listed = await client.GET('/api/v1/notes', { params: { query: { q: 'client' } } });
    const read = await client.GET('/api/v1/notes/{noteId}', { params: { path: { noteId: id } } });

    expect(created.response.status).toBe(201);
    expect(listed.data?.items.map((note) => note.id)).toEqual([id]);
    expect(read.data?.title).toBe('From the client');
  });

  it('gives back the problem of an error, with its code', async () => {
    const missing = await client.GET('/api/v1/notes/{noteId}', {
      params: { path: { noteId: '0190d4c2-0000-7000-8000-000000000000' } },
    });

    expect(missing.response.status).toBe(404);
    expect(missing.error).toMatchObject({ code: 'note.not_found' });
  });
});
