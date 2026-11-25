import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { ConfigError } from '@zigordev/config';
import { describe, expect, it } from 'vitest';
import { readConfig, readMigrateConfig } from './config.ts';

const development = parseEnv(readFileSync(new URL('../.env.development', import.meta.url), 'utf8'));
const database = 'postgresql://notifications_api@127.0.0.1:5435/notifications_api';
const digest = 'a'.repeat(64);

function issues(read: () => unknown): string[] {
  try {
    read();
  } catch (error) {
    return (error as ConfigError).issues.map((issue) => issue.variable);
  }
  return [];
}

describe('readConfig', () => {
  it('needs the name of the service and the database, and fills in the rest', () => {
    expect(readConfig({ OTEL_SERVICE_NAME: 'notifications-api', DATABASE_URL: database })).toEqual({
      PORT: 3000,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'notifications-api',
      DATABASE_URL: database,
      API_KEYS: [],
    });
  });

  it('reads the API keys as JSON, each with its name, its digest and its scopes', () => {
    const config = readConfig({
      OTEL_SERVICE_NAME: 'notifications-api',
      DATABASE_URL: database,
      API_KEYS: JSON.stringify([
        { name: 'notifications-web', sha256: digest, scopes: ['notes:read'] },
      ]),
    });

    expect(config.API_KEYS).toEqual([
      { name: 'notifications-web', sha256: digest, scopes: ['notes:read'] },
    ]);
  });

  it('refuses to start without a name, without a database, or with a port that is none', () => {
    expect(issues(() => readConfig({ PORT: '70000' }))).toEqual([
      'OTEL_SERVICE_NAME',
      'DATABASE_URL',
      'PORT',
    ]);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    [
      'a key with a scope nobody knows',
      JSON.stringify([{ name: 'a', sha256: digest, scopes: ['all'] }]),
    ],
    ['a digest that is no SHA-256', JSON.stringify([{ name: 'a', sha256: 'abc', scopes: [] }])],
  ])('refuses API keys given as %s, and names the field', (_name, keys) => {
    expect(
      issues(() =>
        readConfig({
          OTEL_SERVICE_NAME: 'notifications-api',
          DATABASE_URL: database,
          API_KEYS: keys,
        })
      )
    ).toEqual([expect.stringMatching(/^API_KEYS/)]);
  });

  it('refuses a database address that is not PostgreSQL', () => {
    expect(
      issues(() =>
        readConfig({ OTEL_SERVICE_NAME: 'notifications-api', DATABASE_URL: 'mysql://db/x' })
      )
    ).toEqual(['DATABASE_URL']);
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
        API_KEYS: 'not read here',
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
