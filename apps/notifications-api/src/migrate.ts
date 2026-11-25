import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '@zigordev/api';
import type { Env } from '@zigordev/config';
import { createLogger, type Logger } from '@zigordev/otel';
import { readMigrateConfig } from './config.ts';

export const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));

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
    return 0;
  } catch {
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runMigrations();
}
