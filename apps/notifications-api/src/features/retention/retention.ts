import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Database } from '@zigordev/events';
import type { Logger } from '@zigordev/otel';
import type { PgBoss } from 'pg-boss';
import { deleteBodiesBefore } from './bodies.ts';

export const retentionQueue = 'email-retention';
export const retentionCron = '17 3 * * *';

const dayMs = 24 * 60 * 60 * 1000;
const tracer = trace.getTracer('notifications-api');

export interface RetentionDependencies {
  readonly db: Database;
  readonly logger: Logger;
  readonly retentionDays: number;
  readonly now?: () => Date;
}

export interface RetentionWorkerOptions extends RetentionDependencies {
  readonly boss: PgBoss;
  readonly pollingIntervalSeconds: number;
}

export async function createRetentionSchedule(boss: PgBoss): Promise<void> {
  await boss.createQueue(retentionQueue, { retryLimit: 3, retryDelay: 600, retryBackoff: true });
  await boss.schedule(retentionQueue, retentionCron, null, { tz: 'UTC', missed: 'once' });
}

export function deleteExpiredBodies(deps: RetentionDependencies): Promise<number> {
  const now = deps.now ?? (() => new Date());
  const attributes = { 'notifications.retention.days': deps.retentionDays };
  return tracer.startActiveSpan(
    'email.retention',
    { kind: SpanKind.INTERNAL, attributes },
    async (span) => {
      try {
        const cutoff = new Date(now().getTime() - deps.retentionDays * dayMs);
        const count = await deleteBodiesBefore(deps.db, cutoff);
        span.setAttribute('notifications.retention.deleted', count);
        deps.logger.info({
          event: 'email.bodies_deleted',
          count,
          retentionDays: deps.retentionDays,
        });
        return count;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        deps.logger.error({ event: 'email.retention_failed', error });
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

export async function startRetentionWorker(options: RetentionWorkerOptions): Promise<void> {
  await options.boss.work(
    retentionQueue,
    { pollingIntervalSeconds: options.pollingIntervalSeconds },
    async () => {
      await deleteExpiredBodies(options);
    }
  );
}
