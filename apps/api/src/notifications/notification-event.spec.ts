import { NonRetryableNotificationError } from '../common/errors';
import { isTerminalSuccess, parseNotificationEvent } from './notification-event';

const validPayload = {
  messageId: 'message-1',
  idempotencyKey: 'invitation-1',
  sourceApp: 'gpool',
  channel: 'email',
  templateId: 'gpool.pool-invitation',
  replyTo: 'support@example.com',
  recipient: { email: 'user@example.com' },
  data: { poolName: 'Champions' },
  metadata: { eventType: 'user_invited_to_pool' },
  requestedAt: '2026-03-11T00:00:00Z',
};

describe('parseNotificationEvent', () => {
  it('preserves the existing producer contract and unknown data fields', () => {
    expect(parseNotificationEvent(JSON.stringify(validPayload))).toEqual(validPayload);
  });

  it('accepts the Kini team-invitation producer payload', () => {
    const kiniPayload = {
      messageId: 'kini-message-1',
      idempotencyKey: 'kini:team:team-123:invite:invitee@example.com',
      sourceApp: 'kini',
      channel: 'email',
      templateId: 'kini.team-invitation',
      replyTo: 'owner@example.com',
      recipient: { email: 'invitee@example.com' },
      data: {
        teamId: 'team-123',
        teamName: 'My Team',
        inviterEmail: 'owner@example.com',
        inviterName: 'Owner',
        acceptUrl: 'https://kini.example.com/teams/team-123/accept',
        frontendUrl: 'https://kini.example.com',
        locale: 'en',
      },
      metadata: {
        eventType: 'user_invited_to_team',
        teamId: 'team-123',
        locale: 'en',
      },
      requestedAt: '2026-03-11T00:00:00Z',
    };

    expect(parseNotificationEvent(JSON.stringify(kiniPayload))).toEqual(kiniPayload);
  });

  it.each([
    [{ ...validPayload, messageId: ' ' }, 'messageId'],
    [{ ...validPayload, recipient: { email: 'not-an-email' } }, 'recipient.email'],
    [{ ...validPayload, data: {} }, 'data'],
    [{ ...validPayload, channel: '' }, 'channel'],
  ])('rejects invalid payload field %#', (payload, expectedField) => {
    const parse = () => parseNotificationEvent(JSON.stringify(payload));
    expect(parse).toThrow(NonRetryableNotificationError);
    expect(parse).toThrow(expectedField);
  });

  it('leaves malformed JSON as a retryable parser failure', () => {
    expect(() => parseNotificationEvent('{')).toThrow(SyntaxError);
  });
});

describe('isTerminalSuccess', () => {
  it.each(['sent', 'SENT', 'duplicate'])('treats %s as a terminal success', (status) => {
    expect(isTerminalSuccess({ requestId: 'request-1', status })).toBe(true);
  });

  it('allows failed requests to be retried', () => {
    expect(isTerminalSuccess({ requestId: 'request-1', status: 'failed' })).toBe(false);
  });
});
