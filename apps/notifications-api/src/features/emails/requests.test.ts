import { metrics } from '@opentelemetry/api';
import type { Database } from '@zigordev/events';
import { createEnvelope } from '@zigordev/events';
import { emailRequested } from '@zigordev/notifications-events';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import { describe, expect, it } from 'vitest';
import { createMetrics } from '../../metrics.ts';
import { createProducers, type ProducerEntry } from '../../producers.ts';
import { requestsConsumer, requestsGroup } from './requests.ts';

function options(entries: readonly ProducerEntry[]) {
  return {
    boss: { send: async () => 'job' },
    producers: createProducers(entries),
    metrics: createMetrics(metrics.getMeter('notifications-api-test'), []),
    logger: createLogger({ service: 'notifications-api', destination: captureLogs() }),
    retryPolicy: { retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
  };
}

const shop = { app: 'shop-api', senders: ['shop@zigordev.test'] };

describe('requestsConsumer', () => {
  it('reads nothing while no app may send email', () => {
    expect(requestsConsumer(options([]))).toBeUndefined();
  });

  it('reads the request topic of every producer, in its own group, with the usual pauses', () => {
    const consumer = requestsConsumer(options([shop, { ...shop, app: 'blog-api' }]));

    expect(consumer).toMatchObject({
      group: requestsGroup,
      topics: ['notifications.requests.shop-api', 'notifications.requests.blog-api'],
      events: [emailRequested],
    });
    expect(consumer?.retryDelays).toBeUndefined();
  });

  it('takes another group and other pauses when it is given them', () => {
    const consumer = requestsConsumer({
      ...options([shop]),
      group: 'notifications-api.requests.test',
      retryDelays: [10],
    });

    expect(consumer).toMatchObject({
      group: 'notifications-api.requests.test',
      retryDelays: [10],
    });
  });

  it('refuses a request from a topic that no producer sends on', async () => {
    const consumer = requestsConsumer(options([shop]));
    const event = createEnvelope(emailRequested, {
      to: { email: 'ana@example.com' },
      subject: 'Hello',
      text: 'Hello',
    });

    await expect(
      consumer?.handle(event, {
        tx: {} as Database,
        topic: 'notifications.requests.blog-api',
        partition: 0,
        offset: 0n,
        attempt: 1,
      })
    ).rejects.toThrow('No producer sends on the topic notifications.requests.blog-api');
  });
});
