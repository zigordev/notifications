import { metrics } from '@opentelemetry/api';
import { createEnvelope, type Database } from '@zigordev/events';
import { emailRequested } from '@zigordev/notifications-events';
import { createLogger } from '@zigordev/otel';
import { type CapturedLogs, captureLogs } from '@zigordev/test/app';
import { useTestDatabase } from '@zigordev/test/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMetrics } from '../../metrics.ts';
import { createProducers, type Producer } from '../../producers.ts';
import { type AcceptDependencies, acceptRequest } from './service.ts';

const database = useTestDatabase();
const producers = createProducers([{ app: 'shop-api', senders: ['shop@zigordev.test'] }]);
const shop = producers.all[0] as Producer;
let pool: pg.Pool;
let db: Database;
let logs: CapturedLogs;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: database.url, max: 2 });
  db = drizzle({ client: pool, casing: 'snake_case' });
});

afterAll(async () => {
  await pool.end();
});

function dependencies(send: AcceptDependencies['boss']['send']): AcceptDependencies {
  logs = captureLogs();
  return {
    boss: { send },
    producers,
    metrics: createMetrics(metrics.getMeter('notifications-api-test'), ['shop-api']),
    logger: createLogger({ service: 'notifications-api', destination: logs }),
    retryPolicy: { retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
  };
}

function forbidden() {
  return createEnvelope(emailRequested, {
    from: { email: 'ceo@zigordev.test', name: 'The CEO' },
    to: { email: 'ana@example.com' },
    subject: 'Hello',
    text: 'Hello',
  });
}

describe('acceptRequest', () => {
  it('fails the whole step when the queue refuses the delivery job', async () => {
    const event = createEnvelope(emailRequested, {
      to: { email: 'ana@example.com' },
      subject: 'Hello',
      text: 'Hello',
    });
    const deps = dependencies(async () => null);

    await expect(db.transaction((tx) => acceptRequest(tx, shop, event, deps))).rejects.toThrow(
      'pg-boss refused the delivery job'
    );
    const { rows } = await pool.query(
      'SELECT count(*)::int AS emails FROM emails WHERE request_id = $1',
      [event.id]
    );
    expect(rows).toEqual([{ emails: 0 }]);
  });

  it('answers a forbidden request once, however often it comes', async () => {
    const event = forbidden();
    const deps = dependencies(async () => 'job');

    const first = await db.transaction((tx) => acceptRequest(tx, shop, event, deps));
    const second = await db.transaction((tx) => acceptRequest(tx, shop, event, deps));

    expect([first, second]).toEqual(['forbidden', 'replayed']);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS outcomes FROM events_outbox WHERE value -> 'data' ->> 'requestId' = $1",
      [event.id]
    );
    expect(rows).toEqual([{ outcomes: 1 }]);
    const stored = await pool.query('SELECT from_name FROM emails WHERE request_id = $1', [
      event.id,
    ]);
    expect(stored.rows).toEqual([{ from_name: 'The CEO' }]);
  });
});
