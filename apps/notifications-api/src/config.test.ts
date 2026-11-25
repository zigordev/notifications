import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { ConfigError } from '@zigordev/config';
import { describe, expect, it } from 'vitest';
import { readConfig, readMigrateConfig } from './config.ts';

const development = parseEnv(readFileSync(new URL('../.env.development', import.meta.url), 'utf8'));
const database = 'postgresql://notifications_api@127.0.0.1:5435/notifications_api';

const required = {
  OTEL_SERVICE_NAME: 'notifications-api',
  DATABASE_URL: database,
  KAFKA_BROKERS: 'kafka:9092',
  KAFKA_USERNAME: 'notifications-api',
  KAFKA_PASSWORD: 'local-only',
  SMTP_HOST: 'mailpit',
  SMTP_PORT: '1025',
};

function issues(read: () => unknown): string[] {
  try {
    read();
  } catch (error) {
    return (error as ConfigError).issues.map((issue) => issue.variable);
  }
  return [];
}

describe('readConfig', () => {
  it('needs the service, its database, Kafka and SMTP, and fills in the rest', () => {
    expect(readConfig(required)).toEqual({
      PORT: 3000,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'notifications-api',
      DATABASE_URL: database,
      KAFKA_BROKERS: ['kafka:9092'],
      KAFKA_USERNAME: 'notifications-api',
      KAFKA_PASSWORD: 'local-only',
      FLAGS_FILE: fileURLToPath(new URL('../flags.json', import.meta.url)),
      PRODUCERS_FILE: fileURLToPath(new URL('../producers.json', import.meta.url)),
      SMTP_HOST: 'mailpit',
      SMTP_PORT: 1025,
      SMTP_SECURITY: 'starttls',
      DELIVERY_RETRY_DELAY_SECONDS: 30,
      DELIVERY_RETRY_DELAY_MAX_SECONDS: 300,
      PROVIDER_CHECK_INTERVAL_SECONDS: 30,
      EMAIL_BODY_RETENTION_DAYS: 30,
    });
  });

  it('reads several brokers, separated by commas', () => {
    expect(readConfig({ ...required, KAFKA_BROKERS: 'one:9092, two:9093' }).KAFKA_BROKERS).toEqual([
      'one:9092',
      'two:9093',
    ]);
  });

  it('takes the sign-in of the mail server when it has both parts', () => {
    expect(readConfig({ ...required, SMTP_USER: 'user', SMTP_PASSWORD: 'secret' })).toMatchObject({
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'secret',
    });
  });

  it('refuses to start without what it needs, or with a port that is none', () => {
    expect(issues(() => readConfig({ PORT: '70000' }))).toEqual([
      'OTEL_SERVICE_NAME',
      'DATABASE_URL',
      'KAFKA_BROKERS',
      'KAFKA_USERNAME',
      'KAFKA_PASSWORD',
      'PORT',
      'SMTP_HOST',
      'SMTP_PORT',
    ]);
  });

  it.each([
    ['a user without a password', { SMTP_USER: 'user' }],
    ['a password without a user', { SMTP_PASSWORD: 'secret' }],
  ])('refuses %s for the mail server', (_name, sign) => {
    expect(issues(() => readConfig({ ...required, ...sign }))).toEqual(['SMTP_PASSWORD']);
  });

  it.each([
    ['a database address that is not PostgreSQL', { DATABASE_URL: 'mysql://db/x' }, 'DATABASE_URL'],
    ['a broker without its port', { KAFKA_BROKERS: 'kafka' }, 'KAFKA_BROKERS.0'],
    ['a mail server security nobody knows', { SMTP_SECURITY: 'ssl' }, 'SMTP_SECURITY'],
    [
      'a retry delay of no seconds',
      { DELIVERY_RETRY_DELAY_SECONDS: '0' },
      'DELIVERY_RETRY_DELAY_SECONDS',
    ],
  ])('refuses %s', (_name, wrong, variable) => {
    expect(issues(() => readConfig({ ...required, ...wrong }))).toEqual([variable]);
  });

  it('reads the environment of the process when it is given none', () => {
    expect(() => readConfig()).toThrow(ConfigError);
    expect(() => readMigrateConfig()).toThrow(ConfigError);
  });
});

describe('readMigrateConfig', () => {
  it('takes the address of the app and, when there is one, the address of the superuser', () => {
    expect(
      readMigrateConfig({
        OTEL_SERVICE_NAME: 'notifications-api-migrate',
        DATABASE_URL: database,
        DATABASE_ADMIN_URL: 'postgresql://postgres@127.0.0.1:5435/postgres',
        SMTP_HOST: 'not read here',
      })
    ).toEqual({
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'notifications-api-migrate',
      DATABASE_URL: database,
      DATABASE_ADMIN_URL: 'postgresql://postgres@127.0.0.1:5435/postgres',
    });
  });
});

describe('the settings of pnpm dev', () => {
  it('pass the same check as in the container, and keep the server on this Mac', () => {
    expect(readConfig(development)).toMatchObject({
      PORT: 3000,
      HOST: '127.0.0.1',
      OTEL_SERVICE_NAME: 'notifications-api',
      OTEL_SERVICE_VERSION: 'dev',
      DATABASE_URL: expect.stringMatching(
        /^postgresql:\/\/notifications_api:[^@]+@127\.0\.0\.1:5435\/notifications_api$/
      ),
      KAFKA_USERNAME: 'notifications-api',
      SMTP_SECURITY: 'none',
    });
  });

  it('send the telemetry to the agent on this Mac, and give up on a send within a second', () => {
    expect(development).toMatchObject({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      OTEL_EXPORTER_OTLP_TIMEOUT: '1000',
      OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=local',
    });
  });
});
