import { addToOutbox, type Database } from '@zigordev/events';
import {
  emailFailed,
  emailSent,
  type FailureReason,
  outcomeTopicOf,
} from '@zigordev/notifications-events';
import type { StoredEmail } from './repository.ts';

export async function addSentOutcome(
  db: Database,
  email: StoredEmail,
  sentAt: Date,
  attempts: number
): Promise<void> {
  await addToOutbox(db, {
    topic: outcomeTopicOf(email.producer),
    event: emailSent,
    data: { requestId: email.requestId, sentAt: sentAt.toISOString(), attempts },
    key: email.requestId,
  });
}

export interface Failure {
  readonly failedAt: Date;
  readonly attempts: number;
  readonly reason: FailureReason;
  readonly smtpCode: number | null;
}

export async function addFailedOutcome(
  db: Database,
  email: StoredEmail,
  failure: Failure
): Promise<void> {
  await addToOutbox(db, {
    topic: outcomeTopicOf(email.producer),
    event: emailFailed,
    data: {
      requestId: email.requestId,
      failedAt: failure.failedAt.toISOString(),
      attempts: failure.attempts,
      reason: failure.reason,
      smtpCode: failure.smtpCode,
    },
    key: email.requestId,
  });
}
