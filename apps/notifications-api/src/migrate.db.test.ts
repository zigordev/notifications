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

describe('the migrate job', () => {
  it('makes the role and database of the app, migrates them, and ends with code 0', async () => {
    const name = `notifications_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
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
      expect.objectContaining({ applied: 2, total: 2 }),
    ]);
    const client = new pg.Client({ connectionString: address(name, password, name) });
    await client.connect();
    const { rows } = await client.query('SELECT count(*)::int AS notes FROM notes');
    await client.end();
    expect(rows).toEqual([{ notes: 0 }]);
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
});
