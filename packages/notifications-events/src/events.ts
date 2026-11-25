import { type DataOf, defineEvent, type EventOf, type EventsOf } from '@zigordev/events';
import * as z from 'zod';

const noControlCharacters = /^[^\p{Cc}]*$/u;
const tagKey = /^[a-z][a-z0-9_.-]{0,63}$/;
const encoder = new TextEncoder();

export const maxRequestBytes = 800_000;
export const maxTags = 10;

export const mailboxSchema = z.strictObject({
  email: z.email().max(254),
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(noControlCharacters, 'must not contain control characters')
    .optional(),
});

export type Mailbox = z.output<typeof mailboxSchema>;

export const emailRequestSchema = z
  .strictObject({
    from: mailboxSchema.optional(),
    to: mailboxSchema,
    replyTo: mailboxSchema.optional(),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(998)
      .regex(noControlCharacters, 'must not contain control characters'),
    html: z.string().min(1).max(maxRequestBytes).optional(),
    text: z.string().min(1).max(maxRequestBytes).optional(),
    tags: z
      .record(z.string().regex(tagKey, 'must be a lowercase key'), z.string().max(256))
      .refine((tags) => Object.keys(tags).length <= maxTags, `must hold at most ${maxTags} tags`)
      .default({}),
  })
  .refine((request) => request.html !== undefined || request.text !== undefined, {
    message: 'give html, text or both',
    path: ['text'],
  })
  .refine((request) => encoder.encode(JSON.stringify(request)).byteLength <= maxRequestBytes, {
    message: `must be at most ${maxRequestBytes} bytes as JSON`,
  });

export const emailRequested = defineEvent({
  type: 'email.requested',
  version: 1,
  schema: emailRequestSchema,
});

export const failureReasons = [
  'rejected',
  'attempts_exhausted',
  'retry_limit_reached',
  'sender_forbidden',
] as const;

export type FailureReason = (typeof failureReasons)[number];

export const emailSent = defineEvent({
  type: 'email.sent',
  version: 1,
  schema: z.object({
    requestId: z.uuid(),
    sentAt: z.iso.datetime({ offset: true }),
    attempts: z.number().int().min(1),
  }),
});

export const emailFailed = defineEvent({
  type: 'email.failed',
  version: 1,
  schema: z.object({
    requestId: z.uuid(),
    failedAt: z.iso.datetime({ offset: true }),
    attempts: z.number().int().min(0),
    reason: z.enum(failureReasons),
    smtpCode: z.number().int().min(200).max(599).nullable(),
  }),
});

export const outcomeEvents = [emailSent, emailFailed] as const;

export type EmailRequest = DataOf<typeof emailRequested>;
export type EmailRequestedEvent = EventOf<typeof emailRequested>;
export type EmailOutcomeEvent = EventsOf<typeof outcomeEvents>;
