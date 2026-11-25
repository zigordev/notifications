import { randomUUID } from 'node:crypto';
import { type EmailRequest, requestTopicOf } from '@zigordev/notifications-events';
import { useKafka } from '@zigordev/test/kafka';
import { useTestDatabase } from '@zigordev/test/postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Mailpit, startMailpit } from '../../../test/mailpit.ts';
import { type Product, requestEnvelope, startProduct } from '../../../test/product.ts';
import {
  createProducerTopics,
  emailState,
  type Service,
  startService,
  uniqueApp,
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
    producers: [{ app: shop, senders: ['shop@zigordev.test', 'support@zigordev.test'] }],
  });
  product = startProduct({ app: shop, databaseUrl: productDatabase.url, kafka });
}, 120_000);

afterAll(async () => {
  await product?.stop();
  await service?.app.close();
  await mailpit?.stop();
});

function request(overrides: Partial<EmailRequest> = {}): EmailRequest {
  return {
    from: { email: 'shop@zigordev.test', name: 'The Shop' },
    to: { email: `ana.${randomUUID()}@example.com`, name: 'Ana' },
    replyTo: { email: 'help@example.com' },
    subject: `Your order ${randomUUID()}`,
    html: '<p>Hola</p>',
    text: 'Hola',
    tags: { template: 'order-shipped', locale: 'es' },
    ...overrides,
  };
}

async function deliveredOnce(subject: string) {
  const found = await mailpit.find(subject);
  expect(found).toHaveLength(1);
  return mailpit.message(String(found[0]?.ID));
}

describe('an email request over Kafka', () => {
  it('is delivered as the product rendered it, and answered with email.sent', async () => {
    const data = request();

    const event = await product.request(data);
    const outcome = await product.outcomeOf(event.id);

    expect(outcome).toMatchObject({
      type: 'email.sent',
      version: 1,
      data: { requestId: event.id, attempts: 1, sentAt: expect.any(String) },
    });
    const message = await deliveredOnce(data.subject);
    expect(message.From).toEqual({ Name: 'The Shop', Address: 'shop@zigordev.test' });
    expect(message.To).toEqual([{ Name: 'Ana', Address: data.to.email }]);
    expect(message.ReplyTo).toEqual([{ Name: '', Address: 'help@example.com' }]);
    expect(message.HTML).toContain('<p>Hola</p>');
    expect(message.Text.trim()).toBe('Hola');
    expect(service.logs.find('email.accepted')).toContainEqual(
      expect.objectContaining({ requestId: event.id, producer: shop })
    );
    expect(service.logs.find('email.sent')).toContainEqual(
      expect.objectContaining({ producer: shop, attempt: 1 })
    );
  });

  it('names the request in its outcome, never the address, the subject or the body', async () => {
    const data = request();

    const event = await product.request(data);
    const outcome = await product.outcomeOf(event.id);

    const written = JSON.stringify(outcome);
    expect(written).not.toContain(data.to.email);
    expect(written).not.toContain(data.subject);
    expect(written).not.toContain('Hola');
    const logged = JSON.stringify(service.logs.lines);
    expect(logged).not.toContain(data.to.email);
    expect(logged).not.toContain(data.subject);
  });

  it('sends from the first sender of the product when the request names none', async () => {
    const { from: _from, ...data } = request();

    const event = await product.request(data);
    await product.outcomeOf(event.id);

    const message = await deliveredOnce(data.subject);
    expect(message.From).toEqual({ Name: '', Address: 'shop@zigordev.test' });
  });

  it('accepts another sender of the product, whatever its case', async () => {
    const data = request({ from: { email: 'Support@ZigorDev.test' } });

    const event = await product.request(data);
    const outcome = await product.outcomeOf(event.id);

    expect(outcome.type).toBe('email.sent');
    const message = await deliveredOnce(data.subject);
    expect(message.From.Address.toLowerCase()).toBe('support@zigordev.test');
  });

  it('accepts a request once, however often Kafka brings it', async () => {
    const data = request();
    const envelope = requestEnvelope(data);

    await product.send(requestTopicOf(shop), envelope);
    await product.send(requestTopicOf(shop), envelope);
    const marker = await product.request(request());
    await product.outcomeOf(marker.id);

    await deliveredOnce(data.subject);
    expect(product.outcomes().filter((event) => event.data.requestId === envelope.id)).toHaveLength(
      1
    );
  });

  it('keeps the email as the record of its request, after the consumer forgot it', async () => {
    const data = request();
    const envelope = requestEnvelope(data);
    await product.send(requestTopicOf(shop), envelope);
    await product.outcomeOf(envelope.id);
    const client = new pg.Client({ connectionString: serviceDatabase.url });
    await client.connect();
    await client.query('DELETE FROM events_handled WHERE event_id = $1', [envelope.id]);
    await client.end();

    await product.send(requestTopicOf(shop), envelope);
    await waitFor(
      async () => service.logs.find('email.replayed'),
      (lines) => lines.some((line) => line.requestId === envelope.id)
    );

    await deliveredOnce(data.subject);
  });

  it('answers a sender the product may not use with email.failed, and sends nothing', async () => {
    const data = request({ from: { email: 'ceo@zigordev.test' } });

    const event = await product.request(data);
    const outcome = await product.outcomeOf(event.id);

    expect(outcome).toMatchObject({
      type: 'email.failed',
      data: { requestId: event.id, attempts: 0, reason: 'sender_forbidden', smtpCode: null },
    });
    expect(await mailpit.find(data.subject)).toEqual([]);
    expect(await emailState(serviceDatabase.url, event.id)).toMatchObject({
      status: 'failed',
      failureReason: 'sender_forbidden',
      html: null,
      text: null,
      attempts: [],
    });
    expect(service.logs.find('email.sender_forbidden')).toContainEqual(
      expect.objectContaining({ requestId: event.id, producer: shop })
    );
  });

  it.each([
    ['a message that is no event', { hello: 'world' }, 'not_an_event'],
    [
      'an email request without its addressee',
      { ...requestEnvelope(request()), data: { subject: 'Hello', text: 'Hi' } },
      'invalid_data',
    ],
  ])('sets %s aside, and goes on with the next request', async (_name, value, reason) => {
    await product.send(requestTopicOf(shop), value);
    const next = await product.request(request());

    await product.outcomeOf(next.id);

    expect(service.logs.find('events.message_rejected')).toContainEqual(
      expect.objectContaining({ topic: requestTopicOf(shop), reason })
    );
  });
});
