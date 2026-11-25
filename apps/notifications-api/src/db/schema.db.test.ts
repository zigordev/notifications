import { randomUUID } from 'node:crypto';
import { useTestDatabase } from '@zigordev/test/postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const database = useTestDatabase();
let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: database.url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

function insertEmail(fields: Record<string, string> = {}) {
  const row = {
    producer: 'shop-api',
    request_id: randomUUID(),
    from_email: 'shop@zigordev.test',
    to_email: 'ana@example.com',
    subject: 'Hello',
    ...fields,
  };
  const columns = Object.keys(row);
  return client.query(
    `INSERT INTO emails (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING id`,
    Object.values(row)
  );
}

describe('the emails table', () => {
  it('holds one email for each request of a producer', async () => {
    const requestId = randomUUID();
    await insertEmail({ request_id: requestId });

    await expect(insertEmail({ request_id: requestId })).rejects.toThrow(
      /emails_producer_request_id_key/
    );
    await expect(
      insertEmail({ request_id: requestId, producer: 'blog-api' })
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('refuses a status and a reason it does not know', async () => {
    await expect(insertEmail({ status: 'bounced' })).rejects.toThrow(/emails_status_known/);
    await expect(insertEmail({ failure_reason: 'tired' })).rejects.toThrow(
      /emails_failure_reason_known/
    );
  });

  it('refuses an attempt with an outcome it does not know, and drops the attempts with their email', async () => {
    const { rows } = await insertEmail();
    const emailId = (rows[0] as { id: string }).id;
    const attempt = (outcome: string) =>
      client.query(
        'INSERT INTO email_attempts (email_id, outcome, provider, duration_ms) VALUES ($1, $2, $3, 1)',
        [emailId, outcome, 'smtp']
      );

    await expect(attempt('lost')).rejects.toThrow(/email_attempts_outcome_known/);
    await attempt('sent');
    await client.query('DELETE FROM emails WHERE id = $1', [emailId]);

    const left = await client.query(
      'SELECT count(*)::int AS attempts FROM email_attempts WHERE email_id = $1',
      [emailId]
    );
    expect(left.rows).toEqual([{ attempts: 0 }]);
  });

  it('holds no table of the template any more', async () => {
    const { rows } = await client.query("SELECT to_regclass('public.notes') IS NULL AS gone");

    expect(rows).toEqual([{ gone: true }]);
  });
});
