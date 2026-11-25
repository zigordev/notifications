import type { Database } from '@zigordev/events';
import type { FailureReason } from '@zigordev/notifications-events';
import { and, count, eq, sql } from 'drizzle-orm';
import { type AttemptOutcome, emailAttempts, emails } from '../../db/schema.ts';

export type EmailRow = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;

export interface StoredEmail {
  readonly id: string;
  readonly producer: string;
  readonly requestId: string;
}

const storedColumns = { id: emails.id, producer: emails.producer, requestId: emails.requestId };

export async function insertEmail(db: Database, email: NewEmail): Promise<StoredEmail | undefined> {
  const [created] = await db
    .insert(emails)
    .values(email)
    .onConflictDoNothing({ target: [emails.producer, emails.requestId] })
    .returning(storedColumns);
  return created;
}

export async function findEmail(db: Database, id: string): Promise<EmailRow | undefined> {
  const [email] = await db.select().from(emails).where(eq(emails.id, id));
  return email;
}

export interface NewAttempt {
  readonly emailId: string;
  readonly outcome: AttemptOutcome;
  readonly provider: string;
  readonly smtpCode: number | undefined;
  readonly providerMessageId: string | undefined;
  readonly detail: string | undefined;
  readonly durationMs: number;
}

export async function recordAttempt(db: Database, attempt: NewAttempt): Promise<void> {
  await db.insert(emailAttempts).values({ ...attempt });
}

export interface AttemptCounts {
  readonly total: number;
  readonly deferred: number;
}

export async function countAttempts(db: Database, emailId: string): Promise<AttemptCounts> {
  const [counts = { total: 0, deferred: 0 }] = await db
    .select({
      total: count(),
      deferred: count(sql`case when ${emailAttempts.outcome} = 'deferred' then 1 end`),
    })
    .from(emailAttempts)
    .where(eq(emailAttempts.emailId, emailId));
  return counts;
}

export interface LastAttempt {
  readonly outcome: AttemptOutcome;
  readonly smtpCode: number | null;
}

export async function lastAttempt(db: Database, emailId: string): Promise<LastAttempt | undefined> {
  const [row] = await db
    .select({ outcome: emailAttempts.outcome, smtpCode: emailAttempts.smtpCode })
    .from(emailAttempts)
    .where(eq(emailAttempts.emailId, emailId))
    .orderBy(sql`${emailAttempts.createdAt} desc`, sql`${emailAttempts.id} desc`)
    .limit(1);
  return row;
}

export async function markSent(
  db: Database,
  id: string,
  sentAt: Date
): Promise<StoredEmail | undefined> {
  const [row] = await db
    .update(emails)
    .set({ status: 'sent', sentAt })
    .where(and(eq(emails.id, id), eq(emails.status, 'queued')))
    .returning(storedColumns);
  return row;
}

export async function markFailed(
  db: Database,
  id: string,
  failedAt: Date,
  reason: FailureReason
): Promise<StoredEmail | undefined> {
  const [row] = await db
    .update(emails)
    .set({ status: 'failed', failedAt, failureReason: reason })
    .where(and(eq(emails.id, id), eq(emails.status, 'queued')))
    .returning(storedColumns);
  return row;
}
