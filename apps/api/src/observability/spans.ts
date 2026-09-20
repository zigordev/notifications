import { Attributes, Span, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import type { IHeaders } from 'kafkajs';
import { NotificationEvent } from '../notifications/notification-event';

const TRACER_NAME = 'notifications-api';

export function tracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

export function kafkaTextHeaders(headers: IHeaders | undefined): Record<string, string> {
  const text: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const first = value[0];
      if (first !== undefined && first !== null) text[key] = first.toString('utf8');
      continue;
    }
    text[key] = typeof value === 'string' ? value : value.toString('utf8');
  }

  return text;
}

export function consumeSpanAttributes(
  topic: string,
  partition: number,
  offset: string
): Attributes {
  return {
    'messaging.system': 'kafka',
    'messaging.operation.name': 'process',
    'messaging.destination.name': topic,
    'messaging.destination.partition.id': String(partition),
    'messaging.kafka.offset': offset,
  };
}

export function notificationAttributes(event: NotificationEvent): Attributes {
  return {
    'notification.source_app': event.sourceApp,
    'notification.template_id': event.templateId,
    'notification.channel': event.channel,
  };
}

export function sendSpanAttributes(event: NotificationEvent, provider: string): Attributes {
  return {
    ...notificationAttributes(event),
    'smtp.provider': provider,
  };
}

export function smtpReplyCode(error: unknown): number | undefined {
  const code = (error as { responseCode?: unknown } | null)?.responseCode;
  return typeof code === 'number' ? code : undefined;
}

export function recordSpanError(span: Span, error: unknown): void {
  if (error instanceof Error) span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : 'Unknown error',
  });

  const replyCode = smtpReplyCode(error);
  if (replyCode !== undefined) span.setAttribute('smtp.reply_code', replyCode);
}
