import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PoolClient } from 'pg';
import { flywayCompatibleChecksum, runMigrations } from './migration-runner';

describe('flywayCompatibleChecksum', () => {
  it('is stable across CRLF and LF line endings', () => {
    expect(flywayCompatibleChecksum('SELECT 1;\nSELECT 2;\n')).toBe(
      flywayCompatibleChecksum('SELECT 1;\r\nSELECT 2;\r\n')
    );
  });

  it('returns a signed 32-bit checksum and detects content changes', () => {
    const initial = flywayCompatibleChecksum('SELECT 1;');
    const changed = flywayCompatibleChecksum('SELECT 2;');

    expect(Number.isInteger(initial)).toBe(true);
    expect(initial).not.toBe(changed);
  });
});

describe('runMigrations', () => {
  const sql = 'CREATE TABLE example (id TEXT PRIMARY KEY);\n';
  let migrationDirectory: string;

  beforeEach(async () => {
    migrationDirectory = await mkdtemp(join(tmpdir(), 'notifications-migrations-'));
    await writeFile(join(migrationDirectory, 'V1__init.sql'), sql, 'utf8');
  });

  afterEach(async () => {
    await rm(migrationDirectory, { recursive: true, force: true });
  });

  it('accepts an already-applied migration with the Flyway checksum', async () => {
    const { client, query } = migrationClient(flywayCompatibleChecksum(sql));

    await expect(runMigrations(client, migrationDirectory)).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1))',
      expect.any(Array)
    );
  });

  it('rejects changed content for an already-applied migration', async () => {
    const { client, query } = migrationClient(flywayCompatibleChecksum('different SQL'));

    await expect(runMigrations(client, migrationDirectory)).rejects.toThrow(
      'Migration 1 checksum mismatch'
    );

    expect(query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1))',
      expect.any(Array)
    );
  });
});

function migrationClient(checksum: number): {
  client: PoolClient;
  query: jest.Mock;
} {
  const query = jest.fn(async (statement: string) => {
    if (statement.includes('FROM flyway_schema_history')) {
      return {
        rows: [
          {
            version: '1',
            script: 'V1__init.sql',
            checksum,
            success: true,
          },
        ],
      };
    }
    return { rows: [], rowCount: null };
  });
  return {
    client: { query } as unknown as PoolClient,
    query,
  };
}
