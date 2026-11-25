import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@zigordev/otel';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type App, buildApp } from './app.ts';
import { readConfig } from './config.ts';

const settings = {
  OTEL_SERVICE_NAME: 'notifications-api',
  DATABASE_URL: 'postgresql://nobody@127.0.0.1:1/nothing',
  KAFKA_BROKERS: '127.0.0.1:1',
  KAFKA_USERNAME: 'notifications-api',
  KAFKA_PASSWORD: 'nothing',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1',
};

let app: App;
let lines: string[];

function quiet() {
  return createLogger({ service: 'notifications-api', destination: { write: () => undefined } });
}

beforeEach(async () => {
  lines = [];
  const config = readConfig(settings);
  const logger = createLogger({
    service: config.OTEL_SERVICE_NAME,
    destination: { write: (line: string) => lines.push(line) },
  });
  app = await buildApp({ config, logger, work: false });
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

describe('GET /health', () => {
  it('answers 503 error, naming the database, while the database cannot be reached', async () => {
    vi.stubEnv('OTEL_SERVICE_VERSION', '1f3a9c2');
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      service: 'notifications-api',
      version: '1f3a9c2',
      components: { db: { status: 'down' }, flags: { status: 'up' } },
    });
  });

  it('writes no log line', async () => {
    await app.inject({ method: 'GET', url: '/health' });

    expect(lines).toEqual([]);
  });
});

describe('the docs', () => {
  it('describe an API with no business route, since requests come over Kafka', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ info: { title: 'Notifications API' }, paths: {} });
  });
});

describe('a path that no route matches', () => {
  it('answers 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/emails' });

    expect(response.statusCode).toBe(404);
  });
});

describe('buildApp', () => {
  it('refuses to build with a producers file it cannot use', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'notifications-producers-'));
    const file = join(folder, 'producers.json');
    writeFileSync(file, JSON.stringify({ producers: [{ app: 'Shop', senders: [] }] }));

    await expect(
      buildApp({
        config: readConfig({ ...settings, PRODUCERS_FILE: file }),
        logger: quiet(),
        work: false,
      })
    ).rejects.toThrow(`The producers file ${file} is invalid`);
  });

  it('closes what it opened when a part fails to start', async () => {
    await expect(
      buildApp({
        config: readConfig({ ...settings, FLAGS_FILE: '/nothing/flags.json' }),
        logger: quiet(),
        work: false,
      })
    ).rejects.toThrow('The flags file /nothing/flags.json cannot be read');
  });

  it('refuses to start its work while the database cannot be reached', async () => {
    await expect(buildApp({ config: readConfig(settings), logger: quiet() })).rejects.toThrow();
  });
});
