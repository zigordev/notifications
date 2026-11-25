import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTopics } from '@zigordev/events/testing';
import { createLogger } from '@zigordev/otel';
import { type CapturedLogs, captureLogs } from '@zigordev/test/app';
import type { KafkaAccess } from '@zigordev/test/kafka';
import pg from 'pg';
import { type App, buildApp, type WorkOverrides } from '../src/app.ts';
import { readConfig } from '../src/config.ts';
import type { ProducerEntry } from '../src/producers.ts';
import { waitFor } from './wait.ts';

export function uniqueApp(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

export async function createProducerTopics(kafka: KafkaAccess, apps: readonly string[]) {
  await createTopics(
    { clientId: 'notifications-test', ...kafka },
    apps.flatMap((app) => [
      `notifications.requests.${app}`,
      `notifications.requests.${app}.dead-letter`,
      `notifications.outcomes.${app}`,
      `notifications.outcomes.${app}.dead-letter`,
    ])
  );
}

export function producersFile(producers: readonly ProducerEntry[]): string {
  const folder = mkdtempSync(join(tmpdir(), 'notifications-producers-'));
  const file = join(folder, 'producers.json');
  writeFileSync(file, JSON.stringify({ producers }));
  return file;
}

export interface ServiceOptions {
  readonly databaseUrl: string;
  readonly kafka: KafkaAccess;
  readonly smtp: Record<string, string>;
  readonly producers: readonly ProducerEntry[];
  readonly env?: Record<string, string>;
  readonly work?: WorkOverrides;
}

export interface Service {
  readonly app: App;
  readonly logs: CapturedLogs;
}

export async function startService(options: ServiceOptions): Promise<Service> {
  const logs = captureLogs();
  const config = readConfig({
    OTEL_SERVICE_NAME: 'notifications-api',
    DATABASE_URL: options.databaseUrl,
    KAFKA_BROKERS: options.kafka.brokers.join(','),
    KAFKA_USERNAME: options.kafka.username,
    KAFKA_PASSWORD: options.kafka.password,
    PRODUCERS_FILE: producersFile(options.producers),
    DELIVERY_RETRY_DELAY_SECONDS: '1',
    DELIVERY_RETRY_DELAY_MAX_SECONDS: '1',
    PROVIDER_CHECK_INTERVAL_SECONDS: '1',
    ...options.smtp,
    ...options.env,
  });
  const app = await buildApp({
    config,
    logger: createLogger({ service: 'notifications-api', level: 'debug', destination: logs }),
    work: {
      ...options.work,
      tuning: {
        pollingIntervalSeconds: 0.5,
        deadLetterPollingIntervalSeconds: 0.5,
        retentionPollingIntervalSeconds: 0.5,
        relayInterval: 100,
        requestsGroup: `notifications-api.requests.${randomUUID()}`,
        ...options.work?.tuning,
      },
    },
  });
  return { app, logs };
}

export interface EmailState {
  readonly id: string;
  readonly status: string;
  readonly failureReason: string | null;
  readonly fromEmail: string;
  readonly html: string | null;
  readonly text: string | null;
  readonly attempts: readonly { readonly outcome: string; readonly smtpCode: number | null }[];
}

export async function emailState(
  databaseUrl: string,
  requestId: string
): Promise<EmailState | undefined> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const emails = await client.query<{
      id: string;
      status: string;
      failure_reason: string | null;
      from_email: string;
      html: string | null;
      text: string | null;
    }>(
      'SELECT id, status, failure_reason, from_email, html, text FROM emails WHERE request_id = $1',
      [requestId]
    );
    const email = emails.rows[0];
    if (email === undefined) {
      return undefined;
    }
    const attempts = await client.query<{ outcome: string; smtp_code: number | null }>(
      'SELECT outcome, smtp_code FROM email_attempts WHERE email_id = $1 ORDER BY created_at, id',
      [email.id]
    );
    return {
      id: email.id,
      status: email.status,
      failureReason: email.failure_reason,
      fromEmail: email.from_email,
      html: email.html,
      text: email.text,
      attempts: attempts.rows.map((row) => ({ outcome: row.outcome, smtpCode: row.smtp_code })),
    };
  } finally {
    await client.end();
  }
}

export function waitForStatus(
  databaseUrl: string,
  requestId: string,
  status: string,
  timeoutMs = 20_000
): Promise<EmailState> {
  return waitFor(
    () => emailState(databaseUrl, requestId),
    (email) => email?.status === status,
    timeoutMs
  ) as Promise<EmailState>;
}
