import type { Database } from '@zigordev/events';
import type { FailureReason } from '@zigordev/notifications-events';
import type { Logger } from '@zigordev/otel';
import type { JobResultStatus } from 'pg-boss';
import type { AttemptOutcome } from '../../db/schema.ts';
import type { Metrics } from '../../metrics.ts';
import { addFailedOutcome, addSentOutcome } from '../emails/outcomes.ts';
import {
  countAttempts,
  type EmailRow,
  findEmail,
  lastAttempt,
  markFailed,
  markSent,
  recordAttempt,
} from '../emails/repository.ts';
import type { EmailProvider, OutgoingEmail, SendFailure, SentEmail } from './provider.ts';
import type { ProviderMonitor } from './provider-monitor.ts';
import { maxDeliveryAttempts } from './queues.ts';

export interface DeliveryDependencies {
  readonly db: Database;
  readonly provider: EmailProvider;
  readonly monitor: ProviderMonitor;
  readonly logger: Logger;
  readonly metrics: Metrics;
  readonly now?: () => Date;
}

const outcomes: Readonly<Record<SendFailure['kind'], AttemptOutcome>> = {
  deferred: 'deferred',
  rejected: 'rejected',
  unavailable: 'provider_unavailable',
};

function mailbox(email: string, name: string | null) {
  return name === null ? { email } : { email, name };
}

export function toOutgoingEmail(email: EmailRow): OutgoingEmail {
  return {
    from: mailbox(email.fromEmail, email.fromName),
    to: mailbox(email.toEmail, email.toName),
    ...(email.replyToEmail === null
      ? {}
      : { replyTo: mailbox(email.replyToEmail, email.replyToName) }),
    subject: email.subject,
    html: email.html,
    text: email.text,
  };
}

async function send(
  provider: EmailProvider,
  email: EmailRow
): Promise<{ sent: SentEmail } | { failure: SendFailure }> {
  try {
    return { sent: await provider.send(toOutgoingEmail(email)) };
  } catch (error) {
    return { failure: provider.classify(error) };
  }
}

export async function deliver(
  emailId: string,
  deps: DeliveryDependencies
): Promise<JobResultStatus> {
  const now = deps.now ?? (() => new Date());
  const email = await findEmail(deps.db, emailId);
  if (email === undefined || email.status !== 'queued') {
    return 'completed';
  }
  const startedAt = performance.now();
  const result = await send(deps.provider, email);
  const durationMs = Math.round(performance.now() - startedAt);
  const fields = { emailId, producer: email.producer };

  if ('sent' in result) {
    const sentAt = now();
    const attempts = await deps.db.transaction(async (tx) => {
      await recordAttempt(tx, {
        emailId,
        outcome: 'sent',
        provider: deps.provider.name,
        smtpCode: Number.parseInt(result.sent.response, 10) || undefined,
        providerMessageId: result.sent.messageId,
        detail: result.sent.response,
        durationMs,
      });
      const counts = await countAttempts(tx, emailId);
      const marked = await markSent(tx, emailId, sentAt);
      if (marked !== undefined) {
        await addSentOutcome(tx, marked, sentAt, counts.total);
      }
      return counts.total;
    });
    deps.metrics.attempted(email.producer, 'sent');
    deps.metrics.delivered(email.producer, 'sent');
    deps.metrics.deliveryDuration(
      email.producer,
      (sentAt.getTime() - email.createdAt.getTime()) / 1000
    );
    deps.logger.info({ event: 'email.sent', ...fields, attempt: attempts, durationMs });
    return 'completed';
  }

  const { failure } = result;
  const outcome = outcomes[failure.kind];
  await recordAttempt(deps.db, {
    emailId,
    outcome,
    provider: deps.provider.name,
    smtpCode: failure.smtpCode,
    providerMessageId: undefined,
    detail: failure.detail,
    durationMs,
  });
  deps.metrics.attempted(email.producer, outcome);

  if (failure.kind === 'unavailable') {
    deps.monitor.reportUnavailable(failure);
    return 'failed';
  }
  if (failure.kind === 'rejected') {
    return 'deadletter';
  }
  const attempts = await countAttempts(deps.db, emailId);
  if (attempts.deferred >= maxDeliveryAttempts) {
    return 'deadletter';
  }
  deps.logger.warn({
    event: 'email.retry_scheduled',
    ...fields,
    attempt: attempts.total,
    smtpCode: failure.smtpCode,
  });
  return 'failed';
}

export async function failDeadLetter(emailId: string, deps: DeliveryDependencies): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const failedAt = now();
  const failed = await deps.db.transaction(async (tx) => {
    const last = await lastAttempt(tx, emailId);
    const counts = await countAttempts(tx, emailId);
    const reason: FailureReason =
      last?.outcome === 'rejected'
        ? 'rejected'
        : counts.deferred >= maxDeliveryAttempts
          ? 'attempts_exhausted'
          : 'retry_limit_reached';
    const marked = await markFailed(tx, emailId, failedAt, reason);
    if (marked === undefined) {
      return undefined;
    }
    await addFailedOutcome(tx, marked, {
      failedAt,
      attempts: counts.total,
      reason,
      smtpCode: last?.smtpCode ?? null,
    });
    return { producer: marked.producer, reason };
  });
  if (failed === undefined) {
    return;
  }
  deps.metrics.delivered(failed.producer, 'failed');
  deps.logger.error({
    event: 'email.dead_lettered',
    emailId,
    producer: failed.producer,
    reason: failed.reason,
  });
}
