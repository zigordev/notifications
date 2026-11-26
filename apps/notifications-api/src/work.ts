import { type Meter, metrics as metricsApi } from '@opentelemetry/api';
import { type Database, startEvents } from '@zigordev/events';
import type { HealthComponent, Logger } from '@zigordev/otel';
import { PgBoss } from 'pg-boss';
import type { Config } from './config.ts';
import type { EmailProvider } from './features/delivery/provider.ts';
import { ProviderMonitor } from './features/delivery/provider-monitor.ts';
import { deadLetterQueue, deliveryQueue } from './features/delivery/queues.ts';
import { createSmtpProvider } from './features/delivery/smtp-provider.ts';
import { DeliveryWorker } from './features/delivery/worker.ts';
import { requestsConsumer } from './features/emails/requests.ts';
import { retentionQueue, startRetentionWorker } from './features/retention/retention.ts';
import { createMetrics, observeProvider } from './metrics.ts';
import type { Producers } from './producers.ts';

export const stopTimeoutMs = 20_000;

export interface Tuning {
  readonly pollingIntervalSeconds?: number;
  readonly deadLetterPollingIntervalSeconds?: number;
  readonly retentionPollingIntervalSeconds?: number;
  readonly relayInterval?: number;
  readonly retryDelays?: readonly number[];
  readonly requestsGroup?: string;
}

export interface WorkOptions {
  readonly config: Config;
  readonly logger: Logger;
  readonly db: Database;
  readonly producers: Producers;
  readonly provider?: EmailProvider;
  readonly meter?: Meter;
  readonly tuning?: Tuning;
}

export interface Work {
  readonly health: readonly HealthComponent[];
  stop(): Promise<void>;
}

export interface QueueEvents {
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'warning', listener: (warning: { readonly message: string }) => void): unknown;
}

export function watchQueue(boss: QueueEvents, logger: Logger): void {
  boss.on('error', (error) => {
    logger.error({ event: 'queue.failed', error });
  });
  boss.on('warning', (warning) => {
    logger.warn({ event: 'queue.warning', message: warning.message });
  });
}

export const queues = [deliveryQueue, deadLetterQueue, retentionQueue] as const;

export async function assertQueues(boss: Pick<PgBoss, 'getQueues'>): Promise<void> {
  const found = new Set((await boss.getQueues([...queues])).map((queue) => queue.name));
  const missing = queues.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(
      `The queues ${missing.join(', ')} do not exist: the migrate job makes them, so run it first`
    );
  }
}

export async function startWork(options: WorkOptions): Promise<Work> {
  const { config, logger, db, producers } = options;
  const tuning = options.tuning ?? {};
  const provider =
    options.provider ??
    createSmtpProvider({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      security: config.SMTP_SECURITY,
      user: config.SMTP_USER,
      password: config.SMTP_PASSWORD,
    });
  const monitor = new ProviderMonitor({
    provider,
    logger,
    intervalMs: config.PROVIDER_CHECK_INTERVAL_SECONDS * 1000,
  });
  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    max: 4,
    application_name: config.OTEL_SERVICE_NAME,
    migrate: false,
    openTelemetry: { propagateContext: true },
  });
  watchQueue(boss, logger);
  const meter = options.meter ?? metricsApi.getMeter(config.OTEL_SERVICE_NAME);
  const metrics = createMetrics(meter, producers.apps);
  const retryPolicy = {
    retryDelaySeconds: config.DELIVERY_RETRY_DELAY_SECONDS,
    retryDelayMaxSeconds: config.DELIVERY_RETRY_DELAY_MAX_SECONDS,
  };
  const worker = new DeliveryWorker({
    boss,
    db,
    provider,
    monitor,
    logger,
    metrics,
    pollingIntervalSeconds: tuning.pollingIntervalSeconds ?? 2,
    deadLetterPollingIntervalSeconds: tuning.deadLetterPollingIntervalSeconds ?? 10,
  });

  await boss.start();
  try {
    await assertQueues(boss);
    await worker.start();
    await startRetentionWorker({
      boss,
      db,
      logger,
      retentionDays: config.EMAIL_BODY_RETENTION_DAYS,
      pollingIntervalSeconds: tuning.retentionPollingIntervalSeconds ?? 60,
    });
  } catch (error) {
    await worker.stop();
    await boss.stop({ graceful: false });
    provider.close();
    throw error;
  }

  const consumer = requestsConsumer({
    boss,
    producers,
    metrics,
    logger,
    retryPolicy,
    ...(tuning.retryDelays === undefined ? {} : { retryDelays: tuning.retryDelays }),
    ...(tuning.requestsGroup === undefined ? {} : { group: tuning.requestsGroup }),
  });
  const events = startEvents({
    connection: {
      clientId: config.OTEL_SERVICE_NAME,
      brokers: config.KAFKA_BROKERS,
      username: config.KAFKA_USERNAME,
      password: config.KAFKA_PASSWORD,
    },
    db,
    logger,
    consumers: consumer === undefined ? [] : [consumer],
    ...(tuning.relayInterval === undefined ? {} : { relay: { interval: tuning.relayInterval } }),
  });
  const stopObservingProvider = observeProvider(meter, monitor);

  return {
    health: [
      { name: 'provider', required: false, check: () => monitor.status },
      events.health,
      events.topics,
    ],
    stop: async () => {
      stopObservingProvider();
      await events.stop();
      await worker.stop();
      await boss.stop({ graceful: true, timeout: stopTimeoutMs });
      provider.close();
    },
  };
}
