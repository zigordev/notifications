import { fileURLToPath } from 'node:url';
import { type Env, loadConfig } from '@zigordev/config';
import { kafkaSettings } from '@zigordev/events';
import { flagsSettings } from '@zigordev/flags';
import * as z from 'zod';

const service = {
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_SERVICE_VERSION: z.string().min(1).optional(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
};

const seconds = z.coerce.number().int().min(1);

const schema = z
  .object({
    ...service,
    ...kafkaSettings,
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('0.0.0.0'),
    FLAGS_FILE: flagsSettings.FLAGS_FILE.default(
      fileURLToPath(new URL('../flags.json', import.meta.url))
    ),
    PRODUCERS_FILE: z
      .string()
      .min(1)
      .default(fileURLToPath(new URL('../producers.json', import.meta.url))),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_SECURITY: z.enum(['starttls', 'tls', 'none']).default('starttls'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    DELIVERY_RETRY_DELAY_SECONDS: seconds.default(30),
    DELIVERY_RETRY_DELAY_MAX_SECONDS: seconds.default(300),
    PROVIDER_CHECK_INTERVAL_SECONDS: seconds.default(30),
    EMAIL_BODY_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  })
  .refine((config) => (config.SMTP_USER === undefined) === (config.SMTP_PASSWORD === undefined), {
    message: 'set both SMTP_USER and SMTP_PASSWORD, or neither',
    path: ['SMTP_PASSWORD'],
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
