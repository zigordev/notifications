import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  consumeSpanAttributes,
  kafkaTextHeaders,
  notificationAttributes,
  sendSpanAttributes,
  smtpReplyCode,
} from './spans';
import { NotificationEvent } from '../notifications/notification-event';

const event: NotificationEvent = {
  messageId: 'b9c1',
  idempotencyKey: 'cv:contact:b9c1',
  sourceApp: 'cv',
  channel: 'email',
  templateId: 'contact-message',
  replyTo: 'visitor@example.com',
  recipient: { email: 'owner@example.com' },
  data: { name: 'A visitor', email: 'visitor@example.com' },
  requestedAt: '2026-09-20T09:00:00.000Z',
};

describe('kafkaTextHeaders', () => {
  it('reads the trace context a producer wrote as a buffer', () => {
    expect(
      kafkaTextHeaders({
        traceparent: Buffer.from('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'),
      })
    ).toEqual({
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    });
  });

  it('keeps a header that is already a string', () => {
    expect(kafkaTextHeaders({ tracestate: 'vendor=value' })).toEqual({
      tracestate: 'vendor=value',
    });
  });

  it('takes the first value of a repeated header', () => {
    expect(
      kafkaTextHeaders({ traceparent: [Buffer.from('first'), Buffer.from('second')] })
    ).toEqual({ traceparent: 'first' });
  });

  it('skips headers with no value rather than writing undefined', () => {
    expect(kafkaTextHeaders({ traceparent: undefined, other: Buffer.from('kept') })).toEqual({
      other: 'kept',
    });
  });

  it('returns an empty map for a message with no headers', () => {
    expect(kafkaTextHeaders(undefined)).toEqual({});
  });
});

describe('span attributes', () => {
  it('names the topic, partition and offset a message came from', () => {
    expect(consumeSpanAttributes('notification.email.requested.v1', 3, '4711')).toEqual({
      'messaging.system': 'kafka',
      'messaging.operation.name': 'process',
      'messaging.destination.name': 'notification.email.requested.v1',
      'messaging.destination.partition.id': '3',
      'messaging.kafka.offset': '4711',
    });
  });

  it('describes the notification without any address, masked or not', () => {
    const attributes = {
      ...notificationAttributes(event),
      ...sendSpanAttributes(event, 'gmail'),
    };
    const rendered = JSON.stringify(attributes);

    expect(attributes).toMatchObject({
      'notification.source_app': 'cv',
      'notification.template_id': 'contact-message',
      'notification.channel': 'email',
      'smtp.provider': 'gmail',
    });
    expect(rendered).not.toContain('owner@example.com');
    expect(rendered).not.toContain('visitor@example.com');
    expect(rendered).not.toContain('@');
    expect(rendered).not.toContain('***');
  });
});

describe('smtpReplyCode', () => {
  it('reads the reply code nodemailer puts on a rejection', () => {
    expect(smtpReplyCode(Object.assign(new Error('Invalid login'), { responseCode: 535 }))).toBe(
      535
    );
  });

  it('returns nothing when the failure was not an SMTP reply', () => {
    expect(smtpReplyCode(new Error('socket hang up'))).toBeUndefined();
    expect(smtpReplyCode(undefined)).toBeUndefined();
    expect(smtpReplyCode({ responseCode: '535' })).toBeUndefined();
  });
});

describe('the trace a producer started', () => {
  const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

  beforeAll(() => {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  });

  it('continues into the span this service starts for the message', () => {
    const headers = kafkaTextHeaders({ traceparent: Buffer.from(traceparent) });
    const extracted = propagation.extract(context.active(), headers);
    const parent = trace.getSpanContext(extracted);

    expect(parent?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(parent?.spanId).toBe('b7ad6b7169203331');
  });

  it('starts a new trace when the producer sent no context', () => {
    const extracted = propagation.extract(context.active(), kafkaTextHeaders({}));

    expect(trace.getSpanContext(extracted)).toBeUndefined();
  });
});
