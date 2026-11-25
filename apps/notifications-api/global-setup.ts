import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '@zigordev/api';
import { createLogger } from '@zigordev/otel';
import { kafkaGlobalSetup } from '@zigordev/test/kafka';
import { postgresGlobalSetup } from '@zigordev/test/postgres';
import type { TestProject } from 'vitest/node';
import { migrateQueues, migrations } from './src/migrate.ts';

function storeImage(): string {
  const model = JSON.parse(
    execFileSync('docker', ['compose', '--file', 'compose.yaml', 'config', '--format', 'json'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  ) as { readonly services: Readonly<Record<string, { readonly image?: string }>> };
  const image = model.services['notifications-postgres']?.image;
  if (image === undefined) {
    throw new Error('compose.yaml names no image for notifications-postgres');
  }
  return image;
}

export const postgresImage = storeImage();

const postgres = postgresGlobalSetup({
  image: postgresImage,
  prepare: async (url) => {
    await migrateDatabase({
      url,
      folder: migrations,
      logger: createLogger({ service: 'notifications-api-migrate', level: 'error' }),
    });
    await migrateQueues(url);
  },
});

const kafka = kafkaGlobalSetup();

export async function setup(project: TestProject) {
  const stops = await Promise.all([postgres(project), kafka(project)]);
  return () => Promise.all(stops.map((stop) => stop()));
}
