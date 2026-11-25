import { createEnvelope, readEnvelope } from '@zigordev/events';
import { describe, expect, it } from 'vitest';
import {
  type EmailRequest,
  emailFailed,
  emailRequested,
  emailRequestSchema,
  emailSent,
  maxRequestBytes,
  outcomeEvents,
} from './events.ts';

const requestId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

function request(overrides: Record<string, unknown> = {}): EmailRequest {
  return {
    from: { email: 'shop@zigordev.test', name: 'The Shop' },
    to: { email: 'ana@example.com', name: 'Ana' },
    replyTo: { email: 'help@example.com' },
    subject: 'Your order has shipped',
    html: '<p>Hola</p>',
    text: 'Hola',
    tags: { template: 'order-shipped', locale: 'es' },
    ...overrides,
  } as EmailRequest;
}

function problems(value: unknown): string[] {
  const result = emailRequestSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('email.requested', () => {
  it('is version 1 of the event email.requested', () => {
    expect(emailRequested.type).toBe('email.requested');
    expect(emailRequested.version).toBe(1);
  });

  it('takes a whole email, and only needs the addressee, the subject and one body', () => {
    expect(problems(request())).toEqual([]);
    expect(
      emailRequestSchema.parse({ to: { email: 'ana@example.com' }, subject: 'Hi', text: 'Hi' })
    ).toEqual({ to: { email: 'ana@example.com' }, subject: 'Hi', text: 'Hi', tags: {} });
  });

  it('trims the subject and the names', () => {
    expect(
      emailRequestSchema.parse(
        request({ subject: '  Hi  ', to: { email: 'a@b.test', name: ' Ana ' } })
      )
    ).toMatchObject({ subject: 'Hi', to: { name: 'Ana' } });
  });

  it.each([
    ['no body at all', request({ html: undefined, text: undefined }), 'text'],
    ['an address that is none', request({ to: { email: 'ana' } }), 'to.email'],
    ['a field nobody knows', request({ cc: [] }), ''],
    ['a line break in the subject', request({ subject: 'Hi\r\nBcc: x@y.test' }), 'subject'],
    [
      'a control character in a name',
      request({ to: { email: 'a@b.test', name: 'A\u0000' } }),
      'to.name',
    ],
    ['a tag in capitals', request({ tags: { Template: 'x' } }), 'tags.Template'],
    [
      'eleven tags',
      request({ tags: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`t${i}`, 'x'])) }),
      'tags',
    ],
  ])('refuses %s', (_name, value, path) => {
    expect(problems(value)).toEqual([path]);
  });

  it(`refuses an email whose JSON is over ${maxRequestBytes} bytes, counting each byte of a letter`, () => {
    const letters = 'ñ'.repeat(Math.ceil(maxRequestBytes / 2));

    expect(problems(request({ html: undefined, text: letters }))).toEqual(['']);
    expect(
      problems(request({ html: undefined, text: 'n'.repeat(maxRequestBytes - 1_000) }))
    ).toEqual([]);
  });

  it('travels in the envelope of @zigordev/events, and is read back the same', () => {
    const envelope = createEnvelope(emailRequested, request());

    const reading = readEnvelope([emailRequested], JSON.stringify(envelope));

    expect(reading).toEqual({ ok: true, event: envelope });
  });
});

describe('the outcomes', () => {
  it('are email.sent and email.failed, each in version 1', () => {
    expect(outcomeEvents.map((event) => [event.type, event.version])).toEqual([
      ['email.sent', 1],
      ['email.failed', 1],
    ]);
  });

  it('name the request, when it ended and how many tries it took', () => {
    expect(
      emailSent.schema.parse({ requestId, sentAt: '2026-11-25T09:00:00.000Z', attempts: 1 })
    ).toEqual({ requestId, sentAt: '2026-11-25T09:00:00.000Z', attempts: 1 });
    expect(
      emailFailed.schema.parse({
        requestId,
        failedAt: '2026-11-25T09:00:00.000Z',
        attempts: 5,
        reason: 'attempts_exhausted',
        smtpCode: 451,
      })
    ).toMatchObject({ reason: 'attempts_exhausted', smtpCode: 451 });
  });

  it('let a reader on version 1 read an outcome that gained a field', () => {
    expect(
      emailSent.schema.parse({
        requestId,
        sentAt: '2026-11-25T09:00:00.000Z',
        attempts: 1,
        providerMessageId: 'x',
      })
    ).toEqual({ requestId, sentAt: '2026-11-25T09:00:00.000Z', attempts: 1 });
  });

  it.each([
    ['a reason nobody knows', { reason: 'bounced' }],
    ['an SMTP code that is none', { smtpCode: 99 }],
    ['a request that is no id', { requestId: 'r-1' }],
  ])('refuse %s', (_name, wrong) => {
    expect(
      emailFailed.schema.safeParse({
        requestId,
        failedAt: '2026-11-25T09:00:00.000Z',
        attempts: 1,
        reason: 'rejected',
        smtpCode: 550,
        ...wrong,
      }).success
    ).toBe(false);
  });
});
