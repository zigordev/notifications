import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PoolClient } from 'pg';

interface Migration {
  version: string;
  description: string;
  script: string;
  sql: string;
  checksum: number;
}

interface AppliedMigrationRow {
  version: string | null;
  script: string;
  checksum: number | null;
  success: boolean;
}

const MIGRATION_FILE_PATTERN = /^V([0-9][0-9._]*)__([A-Za-z0-9_-]+)\.sql$/;
const MIGRATION_LOCK_NAME = 'notifications-schema-migrations';

export async function runMigrations(client: PoolClient, directory: string): Promise<void> {
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_NAME]);

  try {
    await ensureFlywayHistoryTable(client);
    const migrations = await readMigrations(directory);
    const appliedResult = await client.query<AppliedMigrationRow>(
      `
        SELECT version, script, checksum, success
        FROM flyway_schema_history
        WHERE version IS NOT NULL
      `
    );
    const appliedByVersion = new Map(
      appliedResult.rows.map((migration) => [migration.version, migration])
    );

    for (const migration of migrations) {
      const existing = appliedByVersion.get(migration.version);
      if (existing) {
        if (!existing.success) {
          throw new Error(`Migration ${migration.version} previously failed (${existing.script})`);
        }
        if (existing.checksum !== null && existing.checksum !== migration.checksum) {
          throw new Error(`Migration ${migration.version} checksum mismatch (${existing.script})`);
        }
        continue;
      }
      await applyMigration(client, migration);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME]);
  }
}

async function ensureFlywayHistoryTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS flyway_schema_history (
      installed_rank INTEGER NOT NULL,
      version VARCHAR(50),
      description VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL,
      script VARCHAR(1000) NOT NULL,
      checksum INTEGER,
      installed_by VARCHAR(100) NOT NULL,
      installed_on TIMESTAMP NOT NULL DEFAULT NOW(),
      execution_time INTEGER NOT NULL,
      success BOOLEAN NOT NULL,
      CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS flyway_schema_history_s_idx
      ON flyway_schema_history (success)
  `);
}

async function readMigrations(directory: string): Promise<Migration[]> {
  const filenames = await readdir(directory);
  const migrations = await Promise.all(
    filenames
      .filter((filename) => MIGRATION_FILE_PATTERN.test(filename))
      .map(async (script) => {
        const match = MIGRATION_FILE_PATTERN.exec(script);
        if (!match?.[1] || !match[2]) {
          throw new Error(`Invalid migration filename: ${script}`);
        }
        const sql = await readFile(join(directory, script), 'utf8');
        return {
          version: match[1].replaceAll('_', '.'),
          description: match[2].replaceAll('_', ' '),
          script,
          sql,
          checksum: flywayCompatibleChecksum(sql),
        };
      })
  );

  return migrations.sort((left, right) => compareVersions(left.version, right.version));
}

async function applyMigration(client: PoolClient, migration: Migration): Promise<void> {
  const startedAt = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await client.query(
      `
        INSERT INTO flyway_schema_history (
          installed_rank,
          version,
          description,
          type,
          script,
          checksum,
          installed_by,
          execution_time,
          success
        )
        SELECT
          COALESCE(MAX(installed_rank), 0) + 1,
          $1,
          $2,
          'SQL',
          $3,
          $4,
          CURRENT_USER,
          $5,
          TRUE
        FROM flyway_schema_history
      `,
      [
        migration.version,
        migration.description,
        migration.script,
        migration.checksum,
        Date.now() - startedAt,
      ]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function flywayCompatibleChecksum(sql: string): number {
  let crc = 0xffffffff;

  for (const line of sql.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    for (const byte of Buffer.from(line, 'utf8')) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
  }

  return (crc ^ 0xffffffff) | 0;
}
