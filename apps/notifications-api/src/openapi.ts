import { writeFile } from 'node:fs/promises';
import { openapiDocument } from '@zigordev/api';
import { createLogger } from '@zigordev/otel';
import { buildApp } from './app.ts';
import { readConfig } from './config.ts';

export const documentFile = new URL('../openapi.json', import.meta.url);

export async function renderOpenapi(): Promise<string> {
  const config = readConfig({
    OTEL_SERVICE_NAME: 'notifications-api',
    DATABASE_URL: 'postgresql://openapi@127.0.0.1:1/openapi',
  });
  const app = await buildApp({
    config,
    logger: createLogger({ service: config.OTEL_SERVICE_NAME, level: 'error' }),
  });
  try {
    return openapiDocument(app);
  } finally {
    await app.close();
  }
}

if (import.meta.main) {
  await writeFile(documentFile, await renderOpenapi());
}
