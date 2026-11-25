import { randomBytes, randomUUID } from 'node:crypto';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import { databaseUrl } from '@zigordev/test/postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { runMigrations } from './migrate.ts';

const templateUrl = inject('postgresTemplateUrl');

function address(role: string, password: string, database: string): string {
  const url = new URL(templateUrl);
  url.username = role;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

function freshName(): string {
  return `notifications_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

async function query<T extends pg.QueryResultRow>(url: string, text: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
}

describe('the migrate job', () => {
  it('makes the role and database of the app, migrates them, sets up the queues and ends with code 0', async () => {
    const name = freshName();
    const password = randomBytes(18).toString('base64url');
    const logs = captureLogs();

    const code = await runMigrations({
      env: {
        OTEL_SERVICE_NAME: 'notifications-api-migrate',
        DATABASE_URL: address(name, password, name),
        DATABASE_ADMIN_URL: databaseUrl(templateUrl, 'postgres'),
      },
      logger: createLogger({ service: 'notifications-api-migrate', destination: logs }),
    });

    expect(code).toBe(0);
    expect(logs.find('migration.finished')).toEqual([
      expect.objectContaining({ applied: 3, total: 3 }),
    ]);
    expect(logs.events().at(-1)).toBe('migration.queues_ready');
    const url = address(name, password, name);
    expect(await query(url, 'SELECT count(*)::int AS emails FROM emails')).toEqual([{ emails: 0 }]);
    expect(await query(url, 'SELECT name FROM pgboss.queue ORDER BY name')).toEqual([
      { name: 'email-dead-letters' },
      { name: 'email-deliveries' },
      { name: 'email-retention' },
    ]);
  });

  it('ends with code 1 when it cannot reach the database, and says so', async () => {
    const logs = captureLogs();

    const code = await runMigrations({
      env: {
        OTEL_SERVICE_NAME: 'notifications-api-migrate',
        DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:1/nothing',
      },
      logger: createLogger({ service: 'notifications-api-migrate', destination: logs }),
    });

    expect(code).toBe(1);
    expect(logs.events()).toEqual(['migration.started', 'migration.failed']);
  });

  it('ends with code 1 when the app may not make its queues, and says so', async () => {
    const name = freshName();
    const password = randomBytes(18).toString('base64url');
    const admin = databaseUrl(templateUrl, 'postgres');
    await query(admin, `CREATE ROLE ${name} LOGIN PASSWORD '${password}'`);
    await query(admin, `CREATE DATABASE ${name} OWNER ${name}`);
    await query(databaseUrl(templateUrl, name), 'CREATE SCHEMA pgboss');
    const logs = captureLogs();

    const code = await runMigrations({
      env: {
        OTEL_SERVICE_NAME: 'notifications-api-migrate',
        DATABASE_URL: address(name, password, name),
      },
      logger: createLogger({ service: 'notifications-api-migrate', destination: logs }),
    });

    expect(code).toBe(1);
    expect(logs.events()).toEqual(['migration.started', 'migration.finished', 'migration.failed']);
  });
});
