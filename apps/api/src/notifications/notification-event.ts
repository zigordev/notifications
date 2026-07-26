import { NonRetryableNotificationError } from '../common/errors';

export interface NotificationEvent {
  messageId: string;
  idempotencyKey: string;
  sourceApp: string;
  channel: string;
  templateId: string;
  replyTo?: string | null;
  recipient: {
    email: string;
  };
  data: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  requestedAt: string;
}

export interface NotificationRequestState {
  requestId: string;
  status: string;
}

export function isTerminalSuccess(state: NotificationRequestState): boolean {
  const status = state.status.toLowerCase();
  return status === 'sent' || status === 'duplicate';
}

export function parseNotificationEvent(payload: string): NotificationEvent {
  const parsed: unknown = JSON.parse(payload);
  if (!isRecord(parsed)) {
    throw invalid('payload must be a JSON object');
  }

  const recipient = parsed.recipient;
  if (!isRecord(recipient)) {
    throw invalid('recipient must be an object');
  }

  const data = parsed.data;
  if (!isRecord(data) || Object.keys(data).length === 0) {
    throw invalid('data must be a non-empty object');
  }

  const event: NotificationEvent = {
    messageId: requiredString(parsed.messageId, 'messageId'),
    idempotencyKey: requiredString(parsed.idempotencyKey, 'idempotencyKey'),
    sourceApp: requiredString(parsed.sourceApp, 'sourceApp'),
    channel: requiredString(parsed.channel, 'channel'),
    templateId: requiredString(parsed.templateId, 'templateId'),
    recipient: {
      email: emailValue(recipient.email, 'recipient.email', false) as string,
    },
    data,
    requestedAt: requiredString(parsed.requestedAt, 'requestedAt'),
  };

  if (parsed.replyTo !== undefined) {
    event.replyTo = emailValue(parsed.replyTo, 'replyTo', true);
  }

  if (parsed.metadata !== undefined) {
    if (parsed.metadata !== null && !isRecord(parsed.metadata)) {
      throw invalid('metadata must be an object when provided');
    }
    event.metadata = parsed.metadata;
  }

  return event;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(`${field} must be a non-blank string`);
  }
  return value;
}

function emailValue(value: unknown, field: string, nullable: boolean): string | null {
  if (nullable && (value === null || value === '')) {
    return value === null ? null : '';
  }
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw invalid(`${field} must be a valid email address`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): NonRetryableNotificationError {
  return new NonRetryableNotificationError(`Invalid notification payload: ${message}`);
}
