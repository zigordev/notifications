import { keysetOrder } from '@zigordev/api';
import { useTestDatabase } from '@zigordev/test/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { notes } from './schema.ts';

const database = useTestDatabase();

describe('the notes table', () => {
  it('serves the default order of the list, newest first, from its index', async () => {
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    try {
      const query = drizzle({ client, casing: 'snake_case' })
        .select()
        .from(notes)
        .orderBy(...keysetOrder([notes.createdAt, notes.id], 'desc'))
        .limit(21)
        .toSQL();
      await client.query('SET enable_seqscan = off');

      const { rows } = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN ${query.sql}`,
        query.params
      );

      const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
      expect(plan).toContain('Index Scan Backward using notes_created_at_id_idx on notes');
      expect(plan).not.toContain('Sort');
    } finally {
      await client.end();
    }
  });

  it('refuses a status it does not know', async () => {
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    try {
      await expect(
        client.query("INSERT INTO notes (title, status) VALUES ('x', 'later')")
      ).rejects.toThrow(/notes_status_known/);
    } finally {
      await client.end();
    }
  });
});
