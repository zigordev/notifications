import { vi } from 'vitest';
import { JsonLogger } from '../observability';
import { DatabaseService } from '../database/database.service';
import { EmailSenderService } from '../email/email-sender.service';
import { NotificationConsumerService } from '../kafka/notification-consumer.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const warn = vi.fn();
  const logger = { warn } as unknown as JsonLogger;
  const relay = (available: boolean) =>
    ({ isAvailable: () => available }) as unknown as EmailSenderService;

  beforeEach(() => {
    warn.mockClear();
  });

  it('reports readiness only when PostgreSQL and Kafka are ready', async () => {
    const database = {
      ping: vi.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseService;
    const kafka = {
      isReady: vi.fn().mockReturnValue(true),
    } as unknown as NotificationConsumerService;
    const health = new HealthService(database, kafka, relay(true), logger);

    await expect(health.check()).resolves.toEqual({
      status: 'ok',
      service: 'notifications-api',
      components: {
        db: { status: 'up' },
        kafka: { status: 'up' },
        smtp: { status: 'up' },
      },
    });
  });

  it('returns a safe degraded response when PostgreSQL is unavailable', async () => {
    const database = {
      ping: vi.fn().mockRejectedValue(new Error('password secret')),
      isClosing: vi.fn().mockReturnValue(false),
    } as unknown as DatabaseService;
    const kafka = {
      isReady: vi.fn().mockReturnValue(true),
    } as unknown as NotificationConsumerService;
    const health = new HealthService(database, kafka, relay(true), logger);

    const result = await health.check();
    expect(result).toEqual({
      status: 'error',
      service: 'notifications-api',
      components: {
        db: { status: 'down' },
        kafka: { status: 'up' },
        smtp: { status: 'up' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('password secret');
    expect(warn).toHaveBeenCalledWith('PostgreSQL readiness check failed', 'HealthService');
  });

  it('reports PostgreSQL down without a warning while the pool is closing for shutdown', async () => {
    const database = {
      ping: vi.fn().mockRejectedValue(new Error('Cannot use a pool after calling end on the pool')),
      isClosing: vi.fn().mockReturnValue(true),
    } as unknown as DatabaseService;
    const kafka = {
      isReady: vi.fn().mockReturnValue(false),
    } as unknown as NotificationConsumerService;
    const health = new HealthService(database, kafka, relay(true), logger);

    await expect(health.check()).resolves.toEqual({
      status: 'error',
      service: 'notifications-api',
      components: {
        db: { status: 'down' },
        kafka: { status: 'down' },
        smtp: { status: 'up' },
      },
    });
    expect(warn).not.toHaveBeenCalled();
  });
});

it('is unhealthy when the relay will not take an email, whatever else is working', async () => {
  const database = { ping: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseService;
  const kafka = {
    isReady: vi.fn().mockReturnValue(true),
  } as unknown as NotificationConsumerService;
  const relayDown = { isAvailable: () => false } as unknown as EmailSenderService;
  const logger = { warn: vi.fn() } as unknown as JsonLogger;

  const body = await new HealthService(database, kafka, relayDown, logger).check();

  expect(body.status).toBe('error');
  expect(body.components.smtp).toEqual({ status: 'down' });
});
