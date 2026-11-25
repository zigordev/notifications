import { randomUUID } from 'node:crypto';
import { metrics } from '@opentelemetry/api';
import { outcomeTopicOf } from '@zigordev/notifications-events';
import { createLogger } from '@zigordev/otel';
import { type CapturedLogs, captureLogs } from '@zigordev/test/app';
import { useTestDatabase } from '@zigordev/test/postgres';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Mailpit, startMailpit } from '../../../test/mailpit.ts';
import { emailAttempts, emails, eventsOutbox } from '../../db/schema.ts';
import { createMetrics } from '../../metrics.ts';
import { findEmail, insertEmail, recordAttempt } from '../emails/repository.ts';
import { type DeliveryDependencies, deliver, failDeadLetter } from './deliver.ts';
import type { EmailProvider } from './provider.ts';
import { ProviderMonitor } from './provider-monitor.ts';
import { createSmtpProvider } from './smtp-provider.ts';

const database = useTestDatabase();
const producer = 'shop-api';
let pool: pg.Pool;
let db: NodePgDatabase<Record<string, unknown>>;
let mailpit: Mailpit;
let provider: EmailProvider;
let logs: CapturedLogs;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: database.url, max: 3 });
  db = drizzle({ client: pool, casing: 'snake_case' });
  mailpit = await startMailpit();
  provider = createSmtpProvider({
    host: String(mailpit.env.SMTP_HOST),
    port: Number(mailpit.env.SMTP_PORT),
    security: 'none',
    user: mailpit.env.SMTP_USER,
    password: mailpit.env.SMTP_PASSWORD,
  });
}, 60_000);

afterEach(async () => {
  await mailpit.calm();
});

afterAll(async () => {
  provider?.close();
  await pool?.end();
  await mailpit?.stop();
});

function dependencies(using: EmailProvider = provider): DeliveryDependencies {
  logs = captureLogs();
  const logger = createLogger({ service: 'notifications-api', level: 'debug', destination: logs });
  return {
    db,
    provider: using,
    monitor: new ProviderMonitor({ provider: using, logger, intervalMs: 3_600_000 }),
    logger,
    metrics: createMetrics(metrics.getMeter('notifications-api-test'), [producer]),
  };
}

async function queued(): Promise<{ id: string; requestId: string; subject: string }> {
  const requestId = randomUUID();
  const subject = `Your order ${randomUUID()}`;
  const stored = await insertEmail(db, {
    producer,
    requestId,
    fromEmail: 'shop@zigordev.test',
    toEmail: `ana.${randomUUID()}@example.com`,
    subject,
    text: 'Hola',
  });
  if (stored === undefined) {
    throw new Error('the email was not stored');
  }
  return { id: stored.id, requestId, subject };
}

async function outcomesOf(requestId: string) {
  const rows = await db
    .select({ topic: eventsOutbox.topic, key: eventsOutbox.key, value: eventsOutbox.value })
    .from(eventsOutbox)
    .where(sql`${eventsOutbox.value} -> 'data' ->> 'requestId' = ${requestId}`);
  return rows.map((row) => ({ ...row, value: row.value as Record<string, unknown> }));
}

async function attempt(emailId: string, outcome: 'deferred' | 'rejected', smtpCode: number) {
  await recordAttempt(db, {
    emailId,
    outcome,
    provider: 'smtp',
    smtpCode,
    providerMessageId: undefined,
    detail: `${smtpCode} refused`,
    durationMs: 5,
  });
}

describe('deliver', () => {
  it('sends a queued email, and adds email.sent to the outbox in the same step', async () => {
    const deps = dependencies();
    const email = await queued();

    const status = await deliver(email.id, deps);

    expect(status).toBe('completed');
    expect(await mailpit.find(email.subject)).toHaveLength(1);
    expect((await findEmail(db, email.id))?.status).toBe('sent');
    expect(await outcomesOf(email.requestId)).toEqual([
      {
        topic: outcomeTopicOf(producer),
        key: email.requestId,
        value: expect.objectContaining({
          type: 'email.sent',
          version: 1,
          data: { requestId: email.requestId, sentAt: expect.any(String), attempts: 1 },
        }),
      },
    ]);
  });

  it('never sends an email twice once it is sent', async () => {
    const deps = dependencies();
    const email = await queued();
    await deliver(email.id, deps);

    const status = await deliver(email.id, deps);

    expect(status).toBe('completed');
    expect(await mailpit.find(email.subject)).toHaveLength(1);
    expect(await outcomesOf(email.requestId)).toHaveLength(1);
  });

  it('completes the job of an email that is gone', async () => {
    expect(await deliver(randomUUID(), dependencies())).toBe('completed');
  });

  it('marks the provider down when a send cannot sign in, and asks for a retry', async () => {
    const deps = dependencies();
    const email = await queued();
    await mailpit.chaos({ Authentication: { ErrorCode: 535, Probability: 100 } });

    const status = await deliver(email.id, deps);

    expect(status).toBe('failed');
    expect(deps.monitor.status).toBe('down');
    expect(logs.find('provider.unavailable')).toEqual([
      expect.objectContaining({ level: 'error', errorClass: 'EAUTH', smtpCode: 535 }),
    ]);
    expect((await findEmail(db, email.id))?.status).toBe('queued');
  });

  it('asks for a retry after a deferred send, until the fifth one', async () => {
    const deps = dependencies();
    const email = await queued();
    await mailpit.chaos({ Recipient: { ErrorCode: 451, Probability: 100 } });

    const statuses = [];
    for (let round = 0; round < 5; round += 1) {
      statuses.push(await deliver(email.id, deps));
    }

    expect(statuses).toEqual(['failed', 'failed', 'failed', 'failed', 'deadletter']);
    expect(logs.find('email.retry_scheduled').map((line) => line.attempt)).toEqual([1, 2, 3, 4]);
  });

  it('keeps no SMTP code for a reply that has none', async () => {
    const email = await queued();
    const quiet: EmailProvider = {
      ...provider,
      name: 'quiet',
      send: async () => ({ messageId: '<quiet@zigordev.test>', response: 'OK' }),
    };

    await deliver(email.id, dependencies(quiet));

    const [row] = await db
      .select({ smtpCode: emailAttempts.smtpCode, provider: emailAttempts.provider })
      .from(emailAttempts)
      .where(eq(emailAttempts.emailId, email.id));
    expect(row).toEqual({ smtpCode: null, provider: 'quiet' });
  });

  it('adds no outcome when the email changed while it was being sent', async () => {
    const email = await queued();
    const racing: EmailProvider = {
      ...provider,
      send: async () => {
        await db.update(emails).set({ status: 'failed' }).where(eq(emails.id, email.id));
        return { messageId: '<race@zigordev.test>', response: '250 OK' };
      },
    };

    await deliver(email.id, dependencies(racing));

    expect((await findEmail(db, email.id))?.status).toBe('failed');
    expect(await outcomesOf(email.requestId)).toEqual([]);
  });

  it('sets a rejected send aside at once', async () => {
    const deps = dependencies();
    const email = await queued();
    await mailpit.chaos({ Recipient: { ErrorCode: 550, Probability: 100 } });

    expect(await deliver(email.id, deps)).toBe('deadletter');
  });
});

describe('failDeadLetter', () => {
  it.each([
    ['rejected', [['rejected', 550]], 550, 1],
    ['attempts_exhausted', Array.from({ length: 5 }, () => ['deferred', 451] as const), 451, 5],
    ['retry_limit_reached', [['deferred', 452]], 452, 1],
    ['retry_limit_reached', [], null, 0],
  ] as const)(
    'fails the email as %s, and adds email.failed to the outbox',
    async (reason, tries, code, count) => {
      const deps = dependencies();
      const email = await queued();
      for (const [outcome, smtpCode] of tries) {
        await attempt(email.id, outcome, smtpCode);
      }

      await failDeadLetter(email.id, deps);

      const [row] = await db
        .select({ status: emails.status, failureReason: emails.failureReason })
        .from(emails)
        .where(and(eq(emails.id, email.id)));
      expect(row).toEqual({ status: 'failed', failureReason: reason });
      expect(await outcomesOf(email.requestId)).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            type: 'email.failed',
            data: {
              requestId: email.requestId,
              failedAt: expect.any(String),
              attempts: count,
              reason,
              smtpCode: code,
            },
          }),
        }),
      ]);
      expect(logs.find('email.dead_lettered')).toEqual([
        expect.objectContaining({ level: 'error', emailId: email.id, producer, reason }),
      ]);
    }
  );

  it('leaves an email that is no longer queued as it is', async () => {
    const deps = dependencies();
    const email = await queued();
    await deliver(email.id, deps);

    await failDeadLetter(email.id, deps);

    expect((await findEmail(db, email.id))?.status).toBe('sent');
    expect(await outcomesOf(email.requestId)).toHaveLength(1);
    expect(logs.find('email.dead_lettered')).toEqual([]);
  });
});
