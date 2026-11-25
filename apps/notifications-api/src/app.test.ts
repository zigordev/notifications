import { createLogger } from '@zigordev/otel';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type App, buildApp } from './app.ts';
import { readConfig } from './config.ts';

let app: App;
let lines: string[];

beforeEach(async () => {
  lines = [];
  const config = readConfig({
    OTEL_SERVICE_NAME: 'notifications-api',
    DATABASE_URL: 'postgresql://nobody@127.0.0.1:1/nothing',
  });
  const logger = createLogger({
    service: config.OTEL_SERVICE_NAME,
    destination: { write: (line: string) => lines.push(line) },
  });
  app = await buildApp({ config, logger });
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

function events(): unknown[] {
  return lines.map((line) => (JSON.parse(line) as { event?: string }).event);
}

describe('GET /health', () => {
  it('answers 503 error, naming the database, while the database cannot be reached', async () => {
    vi.stubEnv('OTEL_SERVICE_VERSION', '1f3a9c2');
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      service: 'notifications-api',
      version: '1f3a9c2',
      components: { db: { status: 'down' } },
    });
  });

  it('writes no log line', async () => {
    await app.inject({ method: 'GET', url: '/health' });

    expect(lines).toEqual([]);
  });
});

describe('GET /api/v1/hello', () => {
  it('answers 200 with a greeting, as JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/hello' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ message: 'Hello from notifications-api' });
  });

  it('writes the event greeting.sent, and no line per request', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/hello' });

    expect(events()).toEqual(['greeting.sent']);
  });
});

describe('a path that no route matches', () => {
  it('answers 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nothing' });

    expect(response.statusCode).toBe(404);
  });
});
