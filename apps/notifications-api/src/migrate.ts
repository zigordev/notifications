import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '@zigordev/api';
import type { Env } from '@zigordev/config';
import { createLogger, type Logger } from '@zigordev/otel';
import { PgBoss } from 'pg-boss';
import { readMigrateConfig } from './config.ts';
import { createQueues } from './features/delivery/queues.ts';
import { createRetentionSchedule } from './features/retention/retention.ts';

export const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function migrateQueues(url: string): Promise<void> {
  const boss = new PgBoss({
    connectionString: url,
    max: 1,
    migrate: true,
    supervise: false,
    schedule: false,
    registerInstance: false,
  });
  await boss.start();
  try {
    await createQueues(boss);
    await createRetentionSchedule(boss);
  } finally {
    await boss.stop({ graceful: false });
  }
}

export interface MigrateRun {
  readonly env?: Env;
  readonly logger?: Logger;
}

export async function runMigrations(run: MigrateRun = {}): Promise<number> {
  const config = readMigrateConfig(run.env);
  const logger =
    run.logger ??
    createLogger({
      service: config.OTEL_SERVICE_NAME,
      release: config.OTEL_SERVICE_VERSION,
      level: config.LOG_LEVEL,
    });
  try {
    await migrateDatabase({
      url: config.DATABASE_URL,
      ...(config.DATABASE_ADMIN_URL === undefined ? {} : { adminUrl: config.DATABASE_ADMIN_URL }),
      folder: migrations,
      logger,
    });
  } catch {
    return 1;
  }
  try {
    await migrateQueues(config.DATABASE_URL);
    logger.info({ event: 'migration.queues_ready' });
    return 0;
  } catch (error) {
    logger.error({ event: 'migration.failed', error });
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runMigrations();
}
