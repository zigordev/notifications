import { failureReasons } from '@zigordev/notifications-events';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export { eventsOutbox, handledEvents } from '@zigordev/events';

export const noteStatuses = ['open', 'done'] as const;

export const notes = pgTable(
  'notes',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    title: text().notNull(),
    body: text().notNull().default(''),
    status: text({ enum: noteStatuses }).notNull().default('open'),
    createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    check('notes_status_known', sql`${table.status} in ('open', 'done')`),
    index('notes_created_at_id_idx').on(table.createdAt, table.id),
  ]
);

export const emailStatuses = ['queued', 'sent', 'failed'] as const;
export type EmailStatus = (typeof emailStatuses)[number];

export const attemptOutcomes = ['sent', 'deferred', 'rejected', 'provider_unavailable'] as const;
export type AttemptOutcome = (typeof attemptOutcomes)[number];

function oneOf(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

function moment() {
  return timestamp({ withTimezone: true, precision: 3 });
}

export const emails = pgTable(
  'emails',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    producer: text().notNull(),
    requestId: uuid().notNull(),
    fromEmail: text().notNull(),
    fromName: text(),
    toEmail: text().notNull(),
    toName: text(),
    replyToEmail: text(),
    replyToName: text(),
    subject: text().notNull(),
    html: text(),
    text: text(),
    tags: jsonb().$type<Record<string, string>>().notNull().default({}),
    status: text({ enum: emailStatuses }).notNull().default('queued'),
    failureReason: text({ enum: failureReasons }),
    sentAt: moment(),
    failedAt: moment(),
    createdAt: moment().notNull().defaultNow(),
    updatedAt: moment()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('emails_producer_request_id_key').on(table.producer, table.requestId),
    check('emails_status_known', sql`${table.status} in (${oneOf(emailStatuses)})`),
    check(
      'emails_failure_reason_known',
      sql`${table.failureReason} is null or ${table.failureReason} in (${oneOf(failureReasons)})`
    ),
  ]
);

export const emailAttempts = pgTable(
  'email_attempts',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    emailId: uuid()
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    outcome: text({ enum: attemptOutcomes }).notNull(),
    provider: text().notNull(),
    smtpCode: integer(),
    providerMessageId: text(),
    detail: text(),
    durationMs: integer().notNull(),
    createdAt: moment().notNull().defaultNow(),
    updatedAt: moment()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('email_attempts_email_id_created_at_idx').on(table.emailId, table.createdAt),
    check('email_attempts_outcome_known', sql`${table.outcome} in (${oneOf(attemptOutcomes)})`),
  ]
);
