import { addDatabase, createApi } from '@zigordev/api';
import type { Logger } from '@zigordev/otel';
import type { Config } from './config.ts';
import { notes as notesTable } from './db/schema.ts';
import { hello } from './features/hello/routes.ts';
import { notes } from './features/notes/routes.ts';
import { apiKeys } from './plugins/api-keys.ts';

export interface AppOptions {
  readonly config: Config;
  readonly logger: Logger;
}

export async function buildApp(options: AppOptions) {
  const { config, logger } = options;
  const service = config.OTEL_SERVICE_NAME;
  const app = await createApi({
    service,
    logger,
    docs: {
      title: 'Notifications API',
      description: 'The API of notifications: a greeting, and notes kept in PostgreSQL',
      version: '1.0.0',
      tags: [
        { name: 'hello', description: 'A greeting, to see that the API answers' },
        { name: 'notes', description: 'Notes to list, read, write and delete' },
      ],
    },
    authenticate: apiKeys(config.API_KEYS),
  });
  const db = addDatabase(app, { url: config.DATABASE_URL, schema: { notes: notesTable } });
  await app.register(hello, { prefix: '/api/v1', service });
  await app.register(notes, { prefix: '/api/v1/notes', db });
  await app.ready();
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
