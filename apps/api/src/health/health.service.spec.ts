import { vi } from 'vitest';
import { JsonLogger } from '../observability';
import { DatabaseService } from '../database/database.service';
import { EmailSenderService } from '../email/email-sender.service';
import { NotificationConsumerService } from '../kafka/notification-consumer.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const log = vi.fn();
  const error = vi.fn();
  const logger = { log, error } as unknown as JsonLogger;
  const relay = (available: boolean) =>
    ({ isAvailable: () => available }) as unknown as EmailSenderService;

  beforeEach(() => {
    log.mockClear();
    error.mockClear();
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
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'postgres.unavailable', errorClass: 'Error' }),
      undefined,
      'HealthService'
    );
  });

  it('logs an outage when it starts and when it ends, not on every probe', async () => {
    const ping = vi.fn().mockRejectedValue(new Error('connection refused'));
    const database = {
      ping,
      isClosing: vi.fn().mockReturnValue(false),
    } as unknown as DatabaseService;
    const kafka = {
      isReady: vi.fn().mockReturnValue(true),
    } as unknown as NotificationConsumerService;
    const health = new HealthService(database, kafka, relay(true), logger);

    await health.check();
    await health.check();
    ping.mockResolvedValue(undefined);
    await health.check();
    await health.check();

    expect(error).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({ event: 'postgres.recovered' }, 'HealthService');
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
    expect(error).not.toHaveBeenCalled();
  });
});

it('is unhealthy when the relay will not take an email, whatever else is working', async () => {
  const database = { ping: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseService;
  const kafka = {
    isReady: vi.fn().mockReturnValue(true),
  } as unknown as NotificationConsumerService;
  const relayDown = { isAvailable: () => false } as unknown as EmailSenderService;
  const logger = { log: vi.fn(), error: vi.fn() } as unknown as JsonLogger;

  const body = await new HealthService(database, kafka, relayDown, logger).check();

  expect(body.status).toBe('error');
  expect(body.components.smtp).toEqual({ status: 'down' });
});
