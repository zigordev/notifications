import { type Env, loadConfig } from '@zigordev/config';
import * as z from 'zod';
import { apiKeysSchema } from './plugins/api-keys.ts';

const service = {
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_SERVICE_VERSION: z.string().min(1).optional(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
};

const schema = z.object({
  ...service,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  API_KEYS: z
    .string()
    .default('[]')
    .transform((text, context) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        context.addIssue({ code: 'custom', message: 'is not JSON' });
        return z.NEVER;
      }
    })
    .pipe(apiKeysSchema),
});

const migrateSchema = z.object({
  ...service,
  DATABASE_ADMIN_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
});

export type Config = z.output<typeof schema>;
export type MigrateConfig = z.output<typeof migrateSchema>;

export function readConfig(env: Env = process.env): Config {
  return loadConfig(schema, { env });
}

export function readMigrateConfig(env: Env = process.env): MigrateConfig {
  return loadConfig(migrateSchema, { env });
}
