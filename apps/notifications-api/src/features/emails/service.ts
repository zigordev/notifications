import type { Database } from '@zigordev/events';
import type { EmailRequestedEvent } from '@zigordev/notifications-events';
import type { Logger } from '@zigordev/otel';
import { sql } from 'drizzle-orm';
import { type DrizzleTransactionLike, fromDrizzle, type PgBoss } from 'pg-boss';
import type { AcceptOutcome, Metrics } from '../../metrics.ts';
import type { Producer, Producers } from '../../producers.ts';
import {
  type DeliveryJob,
  deliveryQueue,
  deliverySendOptions,
  type RetryPolicy,
} from '../delivery/queues.ts';
import { addFailedOutcome } from './outcomes.ts';
import { insertEmail } from './repository.ts';

export interface AcceptDependencies {
  readonly boss: Pick<PgBoss, 'send'>;
  readonly producers: Producers;
  readonly metrics: Metrics;
  readonly logger: Logger;
  readonly retryPolicy: RetryPolicy;
  readonly now?: () => Date;
}

export async function acceptRequest(
  tx: Database,
  producer: Producer,
  event: EmailRequestedEvent,
  deps: AcceptDependencies
): Promise<AcceptOutcome> {
  const now = deps.now ?? (() => new Date());
  const request = event.data;
  const fields = { requestId: event.id, producer: producer.app };
  const sender = deps.producers.senderFor(producer, request.from);
  const failedAt = now();
  const stored = await insertEmail(tx, {
    producer: producer.app,
    requestId: event.id,
    fromEmail: sender.mailbox.email,
    fromName: sender.mailbox.name ?? null,
    toEmail: request.to.email,
    toName: request.to.name ?? null,
    replyToEmail: request.replyTo?.email ?? null,
    replyToName: request.replyTo?.name ?? null,
    subject: request.subject,
    tags: request.tags,
    ...(sender.allowed
      ? { html: request.html ?? null, text: request.text ?? null }
      : { status: 'failed', failedAt, failureReason: 'sender_forbidden' }),
  });
  if (stored === undefined) {
    deps.metrics.accepted(producer.app, 'replayed');
    deps.logger.info({ event: 'email.replayed', ...fields });
    return 'replayed';
  }

  if (!sender.allowed) {
    await addFailedOutcome(tx, stored, {
      failedAt,
      attempts: 0,
      reason: 'sender_forbidden',
      smtpCode: null,
    });
    deps.metrics.accepted(producer.app, 'forbidden');
    deps.metrics.delivered(producer.app, 'failed');
    deps.logger.warn({ event: 'email.sender_forbidden', emailId: stored.id, ...fields });
    return 'forbidden';
  }

  const job: DeliveryJob = { emailId: stored.id };
  const jobId = await deps.boss.send(deliveryQueue, job, {
    ...deliverySendOptions(deps.retryPolicy),
    db: fromDrizzle(tx as DrizzleTransactionLike, sql),
  });
  if (jobId === null) {
    throw new Error(`pg-boss refused the delivery job for email ${stored.id}`);
  }
  deps.metrics.accepted(producer.app, 'created');
  deps.logger.info({ event: 'email.accepted', emailId: stored.id, ...fields });
  return 'created';
}
