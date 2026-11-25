import { randomUUID } from 'node:crypto';
import type { EmailRequest } from '@zigordev/notifications-events';
import { useKafka } from '@zigordev/test/kafka';
import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Mailpit, startMailpit } from '../../../test/mailpit.ts';
import { type Product, startProduct } from '../../../test/product.ts';
import {
  createProducerTopics,
  emailState,
  type Service,
  startService,
  uniqueApp,
  waitForStatus,
} from '../../../test/service.ts';
import { waitFor } from '../../../test/wait.ts';

const kafka = useKafka();
const serviceDatabase = useTestDatabase();
const productDatabase = useTestDatabase();
const shop = uniqueApp('shop');

let mailpit: Mailpit;
let service: Service;
let product: Product;

beforeAll(async () => {
  [mailpit] = await Promise.all([startMailpit(), createProducerTopics(kafka, [shop])]);
  service = await startService({
    databaseUrl: serviceDatabase.url,
    kafka,
    smtp: mailpit.env,
    producers: [{ app: shop, senders: ['shop@zigordev.test'] }],
  });
  product = startProduct({ app: shop, databaseUrl: productDatabase.url, kafka });
}, 120_000);

afterEach(async () => {
  await mailpit.calm();
  await waitFor(health, (answer) => answer.body.status === 'ok');
});

afterAll(async () => {
  await product?.stop();
  await service?.app.close();
  await mailpit?.stop();
});

function request(): EmailRequest {
  return {
    to: { email: `ana.${randomUUID()}@example.com` },
    subject: `Your order ${randomUUID()}`,
    text: 'Hola',
  };
}

async function health(): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await service.app.inject({ method: 'GET', url: '/health' });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
}

describe('delivery through SMTP', () => {
  it('reports every part it depends on, the provider and Kafka among them', async () => {
    const answer = await waitFor(health, (current) => current.body.status === 'ok');

    expect(answer).toEqual({
      statusCode: 200,
      body: {
        status: 'ok',
        service: 'notifications-api',
        version: expect.any(String),
        components: {
          db: { status: 'up' },
          flags: { status: 'up' },
          provider: { status: 'up' },
          kafka: { status: 'up' },
        },
      },
    });
  });

  it('retries a deferred email, and sends it once the server takes it', async () => {
    await mailpit.chaos({ Recipient: { ErrorCode: 451, Probability: 100 } });

    const event = await product.request(request());
    await waitFor(
      async () => service.logs.find('email.retry_scheduled'),
      (lines) => lines.some((line) => line.smtpCode === 451)
    );
    await mailpit.calm();
    const outcome = await product.outcomeOf(event.id);

    expect(outcome).toMatchObject({ type: 'email.sent', data: { requestId: event.id } });
    const email = await emailState(serviceDatabase.url, event.id);
    expect(email?.attempts[0]).toEqual({ outcome: 'deferred', smtpCode: 451 });
    expect(email?.attempts.at(-1)).toMatchObject({ outcome: 'sent', smtpCode: 250 });
    expect(outcome.type === 'email.sent' && outcome.data.attempts).toBe(email?.attempts.length);
  });

  it('fails an email after five deferred attempts, and says so', async () => {
    await mailpit.chaos({ Recipient: { ErrorCode: 451, Probability: 100 } });

    const event = await product.request(request());
    const outcome = await product.outcomeOf(event.id, 45_000);

    expect(outcome).toMatchObject({
      type: 'email.failed',
      data: { requestId: event.id, attempts: 5, reason: 'attempts_exhausted', smtpCode: 451 },
    });
    const email = await emailState(serviceDatabase.url, event.id);
    expect(email).toMatchObject({ status: 'failed', failureReason: 'attempts_exhausted' });
    expect(email?.attempts.map((attempt) => attempt.outcome)).toEqual([
      'deferred',
      'deferred',
      'deferred',
      'deferred',
      'deferred',
    ]);
    expect(service.logs.find('email.dead_lettered')).toContainEqual(
      expect.objectContaining({ emailId: email?.id, producer: shop, reason: 'attempts_exhausted' })
    );
  }, 60_000);

  it('fails a rejected email at once', async () => {
    await mailpit.chaos({ Recipient: { ErrorCode: 550, Probability: 100 } });

    const event = await product.request(request());
    const outcome = await product.outcomeOf(event.id);

    expect(outcome).toMatchObject({
      type: 'email.failed',
      data: { requestId: event.id, attempts: 1, reason: 'rejected', smtpCode: 550 },
    });
    expect((await emailState(serviceDatabase.url, event.id))?.attempts).toEqual([
      { outcome: 'rejected', smtpCode: 550 },
    ]);
  });

  it('holds mail while the provider is down, and sends it once it is back', async () => {
    await mailpit.chaos({ Authentication: { ErrorCode: 535, Probability: 100 } });
    const down = await waitFor(health, (answer) => answer.body.status === 'degraded');

    const event = await product.request(request());
    await waitForStatus(serviceDatabase.url, event.id, 'queued');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const held = await emailState(serviceDatabase.url, event.id);
    await mailpit.calm();
    const outcome = await product.outcomeOf(event.id);

    expect(down).toMatchObject({
      statusCode: 200,
      body: {
        status: 'degraded',
        components: { db: { status: 'up' }, provider: { status: 'down' } },
      },
    });
    expect(held).toMatchObject({ status: 'queued', attempts: [] });
    expect(outcome).toMatchObject({ type: 'email.sent', data: { attempts: 1 } });
    expect(service.logs.find('provider.unavailable')).toContainEqual(
      expect.objectContaining({ provider: 'smtp', errorClass: 'EAUTH', smtpCode: 535 })
    );
    expect(service.logs.find('provider.recovered').length).toBeGreaterThan(0);
  });
});
