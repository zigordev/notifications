import { randomUUID } from 'node:crypto';
import { useKafka } from '@zigordev/test/kafka';
import { useTestDatabase } from '@zigordev/test/postgres';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Product, startProduct } from '../test/product.ts';
import {
  createProducerTopics,
  emailState,
  type Service,
  startService,
  uniqueApp,
} from '../test/service.ts';
import { waitFor } from '../test/wait.ts';
import type { EmailProvider, SentEmail } from './features/delivery/provider.ts';
import { classifySmtpError } from './features/delivery/smtp-provider.ts';

const kafka = useKafka();
const noQueues = useTestDatabase();
const noDeliveries = useTestDatabase();
const broken = useTestDatabase();
const brokenProduct = useTestDatabase();
const smtp = { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_SECURITY: 'none' };

class Clumsy implements EmailProvider {
  readonly name = 'clumsy';
  sends = 0;

  async send(): Promise<SentEmail> {
    this.sends += 1;
    throw new Error('the wire came loose');
  }

  async verify(): Promise<void> {}

  classify(error: unknown) {
    if (this.sends === 1) {
      throw new Error('the error could not be read');
    }
    return classifySmtpError(error);
  }

  close(): void {}
}

async function deleteQueues(url: string, names: readonly string[]): Promise<void> {
  const boss = new PgBoss({ connectionString: url, max: 1, supervise: false, schedule: false });
  await boss.start();
  try {
    for (const name of names) {
      await boss.deleteQueue(name);
    }
  } finally {
    await boss.stop({ graceful: false });
  }
}

describe('the work of the service', () => {
  it('refuses to start, and closes what it opened, when the migrate job made no queues', async () => {
    await deleteQueues(noQueues.url, ['email-deliveries', 'email-dead-letters', 'email-retention']);

    await expect(
      startService({ databaseUrl: noQueues.url, kafka, smtp, producers: [] })
    ).rejects.toThrow(
      'The queues email-deliveries, email-dead-letters, email-retention do not exist: the migrate job makes them, so run it first'
    );
  });

  it('names the one queue that is missing', async () => {
    await deleteQueues(noDeliveries.url, ['email-deliveries']);

    await expect(
      startService({ databaseUrl: noDeliveries.url, kafka, smtp, producers: [] })
    ).rejects.toThrow('The queues email-deliveries do not exist');
  });
});

describe('a delivery that throws', () => {
  const shop = uniqueApp('shop');
  const provider = new Clumsy();
  let service: Service;
  let product: Product;

  beforeAll(async () => {
    await createProducerTopics(kafka, [shop]);
    service = await startService({
      databaseUrl: broken.url,
      kafka,
      smtp,
      producers: [{ app: shop, senders: ['shop@zigordev.test'] }],
      work: { provider },
    });
    product = startProduct({ app: shop, databaseUrl: brokenProduct.url, kafka });
  }, 60_000);

  afterAll(async () => {
    await product?.stop();
    await service?.app.close();
  });

  it('is written down, and the job is tried again', async () => {
    const event = await product.request({
      to: { email: `ana.${randomUUID()}@example.com` },
      subject: 'Hello',
      text: 'Hello',
    });

    await waitFor(
      async () => (await emailState(broken.url, event.id))?.attempts ?? [],
      (attempts) => attempts.length > 0
    );

    expect(service.logs.find('email.delivery_failed')).toEqual([
      expect.objectContaining({ level: 'error', emailId: expect.any(String) }),
    ]);
    expect((await emailState(broken.url, event.id))?.attempts[0]).toMatchObject({
      outcome: 'deferred',
    });
  });
});
