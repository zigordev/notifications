import { addDatabase, addHealthComponent, createApi } from '@zigordev/api';
import { startFlags } from '@zigordev/flags';
import type { Logger } from '@zigordev/otel';
import type { Config } from './config.ts';
import * as schema from './db/schema.ts';
import { readProducers } from './producers.ts';
import { startWork, type WorkOptions } from './work.ts';

export type WorkOverrides = Pick<WorkOptions, 'provider' | 'meter' | 'tuning'>;

export interface AppOptions {
  readonly config: Config;
  readonly logger: Logger;
  readonly work?: WorkOverrides | false;
}

export async function buildApp(options: AppOptions) {
  const { config, logger } = options;
  const service = config.OTEL_SERVICE_NAME;
  const producers = readProducers(config.PRODUCERS_FILE);
  const app = await createApi({
    service,
    logger,
    docs: {
      title: 'Notifications API',
      description:
        'The notifications service of the zigordev platform. Email requests and their outcomes travel over Kafka, so this API serves only its health route and these docs.',
      version: '1.0.0',
    },
  });
  const db = addDatabase(app, { url: config.DATABASE_URL, schema });
  try {
    const flags = await startFlags({ app: service, file: config.FLAGS_FILE });
    addHealthComponent(app, flags.health);
    app.addHook('onClose', () => flags.stop());
    if (options.work !== false) {
      const work = await startWork({ config, logger, db, producers, ...options.work });
      for (const component of work.health) {
        addHealthComponent(app, component);
      }
      app.addHook('onClose', () => work.stop());
    }
    await app.ready();
  } catch (error) {
    await app.close();
    throw error;
  }
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
