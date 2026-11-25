import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emailFailed, emailRequested, emailSent } from '../src/events.ts';
import { contractFile, renderContract } from './contract.ts';

describe('the committed contract of the events', () => {
  it('is what the code describes. Run pnpm --dir packages/notifications-events run contract after a change, and read the difference before committing it', () => {
    const committed: unknown = JSON.parse(readFileSync(contractFile, 'utf8'));

    expect(committed).toEqual(JSON.parse(renderContract()));
  });

  it('holds version 1 of the request and of both outcomes, and the names of their topics', () => {
    const contract = JSON.parse(renderContract()) as {
      readonly topics: Record<string, string>;
      readonly events: readonly { readonly type: string; readonly version: number }[];
    };

    expect(contract.topics).toEqual({
      requests: 'notifications.requests.<app>',
      outcomes: 'notifications.outcomes.<app>',
    });
    expect(contract.events.map((event) => `${event.type} ${event.version}`)).toEqual([
      'email.requested 1',
      'email.sent 1',
      'email.failed 1',
    ]);
  });
});

describe('version 1, as apps already send and read it', () => {
  const sent = [
    { to: { email: 'ana@example.com' }, subject: 'Hello', text: 'Hello' },
    { to: { email: 'ana@example.com' }, subject: 'Hello', html: '<p>Hello</p>' },
    {
      from: { email: 'shop@zigordev.com', name: 'The Shop' },
      to: { email: 'ana@example.com', name: 'Ana' },
      replyTo: { email: 'help@zigordev.com', name: 'Help' },
      subject: 'Your order has shipped',
      html: '<p>Hola</p>',
      text: 'Hola',
      tags: { template: 'order-shipped', locale: 'es' },
    },
  ];

  it.each(sent)('still takes a request an app could send: %j', (request) => {
    expect(emailRequested.schema.safeParse(request).success).toBe(true);
  });

  it('still gives the outcomes an app already reads', () => {
    const requestId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

    expect(
      emailSent.schema.safeParse({ requestId, sentAt: '2026-11-25T09:00:00.000Z', attempts: 1 })
        .success
    ).toBe(true);
    expect(
      emailFailed.schema.safeParse({
        requestId,
        failedAt: '2026-11-25T09:00:00.000Z',
        attempts: 0,
        reason: 'sender_forbidden',
        smtpCode: null,
      }).success
    ).toBe(true);
  });
});
