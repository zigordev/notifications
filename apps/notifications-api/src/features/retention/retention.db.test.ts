import { randomUUID } from 'node:crypto';
import { createLogger } from '@zigordev/otel';
import { type CapturedLogs, captureLogs } from '@zigordev/test/app';
import { useKafka } from '@zigordev/test/kafka';
import { useTestDatabase } from '@zigordev/test/postgres';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startService } from '../../../test/service.ts';
import { waitFor } from '../../../test/wait.ts';
import { emailAttempts, emails } from '../../db/schema.ts';
import { recordAttempt } from '../emails/repository.ts';
import { deleteExpiredBodies, retentionCron, retentionQueue } from './retention.ts';

const database = useTestDatabase();
const kafka = useKafka();
const now = new Date('2030-01-31T00:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
let pool: pg.Pool;
let db: NodePgDatabase<Record<string, unknown>>;
let logs: CapturedLogs;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: database.url, max: 3 });
  db = drizzle({ client: pool, casing: 'snake_case' });
  logs = captureLogs();
});

afterAll(async () => {
  await pool.end();
});

function logger() {
  return createLogger({ service: 'notifications-api', destination: logs });
}

interface Final {
  readonly status?: 'queued' | 'sent' | 'failed';
  readonly sentAt?: Date;
  readonly failedAt?: Date;
  readonly text?: string | null;
}

async function insert(final: Final): Promise<string> {
  const [row] = await db
    .insert(emails)
    .values({
      producer: 'shop-api',
      requestId: randomUUID(),
      fromEmail: 'shop@zigordev.test',
      toEmail: 'ana@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: final.text === undefined ? 'Hello' : final.text,
      status: final.status ?? 'sent',
      sentAt: final.sentAt,
      failedAt: final.failedAt,
    })
    .returning({ id: emails.id });
  if (row === undefined) {
    throw new Error('insert returned nothing');
  }
  return row.id;
}

async function stored(id: string) {
  const [row] = await db
    .select({
      html: emails.html,
      text: emails.text,
      subject: emails.subject,
      toEmail: emails.toEmail,
      status: emails.status,
    })
    .from(emails)
    .where(eq(emails.id, id));
  return row;
}

describe('deleteExpiredBodies', () => {
  it('deletes the bodies of emails sent or failed before the retention period, and only those', async () => {
    const oldSent = await insert({ sentAt: daysAgo(31) });
    const oldFailed = await insert({ status: 'failed', failedAt: daysAgo(45) });
    const recentSent = await insert({ sentAt: daysAgo(29) });
    const queued = await insert({ status: 'queued' });
    const htmlOnly = await insert({ sentAt: daysAgo(60), text: null });
    await recordAttempt(db, {
      emailId: oldSent,
      outcome: 'sent',
      provider: 'smtp',
      smtpCode: 250,
      providerMessageId: '<id@test>',
      detail: '250 OK',
      durationMs: 12,
    });

    const count = await deleteExpiredBodies({
      db,
      logger: logger(),
      retentionDays: 30,
      now: () => now,
    });

    expect(count).toBe(3);
    for (const id of [oldSent, oldFailed, htmlOnly]) {
      expect(await stored(id)).toMatchObject({
        html: null,
        text: null,
        subject: 'Hello',
        toEmail: 'ana@example.com',
      });
    }
    expect(await stored(recentSent)).toMatchObject({ html: '<p>Hello</p>', text: 'Hello' });
    expect(await stored(queued)).toMatchObject({ html: '<p>Hello</p>', status: 'queued' });
    const attempts = await db
      .select({ outcome: emailAttempts.outcome })
      .from(emailAttempts)
      .where(eq(emailAttempts.emailId, oldSent));
    expect(attempts).toEqual([{ outcome: 'sent' }]);
    expect(logs.find('email.bodies_deleted').at(-1)).toMatchObject({
      level: 'info',
      count: 3,
      retentionDays: 30,
    });
  });

  it('finds nothing left to delete on the next run', async () => {
    const count = await deleteExpiredBodies({
      db,
      logger: logger(),
      retentionDays: 30,
      now: () => now,
    });

    expect(count).toBe(0);
    expect(logs.find('email.bodies_deleted').at(-1)).toMatchObject({ count: 0 });
  });

  it('logs and rethrows when the database cannot be reached', async () => {
    const unreachable = new pg.Pool({ connectionString: 'postgresql://test@127.0.0.1:1/test' });
    try {
      await expect(
        deleteExpiredBodies({
          db: drizzle({ client: unreachable, casing: 'snake_case' }),
          logger: logger(),
          retentionDays: 30,
        })
      ).rejects.toThrow();
    } finally {
      await unreachable.end();
    }

    expect(logs.find('email.retention_failed')).toEqual([
      expect.objectContaining({ level: 'error' }),
    ]);
  });
});

describe('the retention job', () => {
  it('is scheduled every day at 03:17 UTC by the migrate job', async () => {
    const { rows } = await pool.query<{ cron: string; timezone: string }>(
      "SELECT cron, options->>'tz' AS timezone FROM pgboss.schedule WHERE name = $1",
      [retentionQueue]
    );

    expect(rows).toEqual([{ cron: retentionCron, timezone: 'UTC' }]);
  });

  it('deletes expired bodies when the service runs it', async () => {
    const expired = await insert({ sentAt: new Date('2020-01-01T00:00:00.000Z') });
    const service = await startService({
      databaseUrl: database.url,
      kafka,
      smtp: { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_SECURITY: 'none' },
      producers: [],
      env: { EMAIL_BODY_RETENTION_DAYS: '7' },
    });
    const boss = new PgBoss({ connectionString: database.url, max: 1, supervise: false });
    try {
      await boss.start();
      await boss.send(retentionQueue, null);

      const [event] = await waitFor(
        async () => service.logs.find('email.bodies_deleted'),
        (events) => events.length > 0
      );
      expect(event).toMatchObject({ retentionDays: 7 });
      expect(await stored(expired)).toMatchObject({ html: null, text: null });
    } finally {
      await boss.stop({ graceful: false });
      await service.app.close();
    }
  });
});
