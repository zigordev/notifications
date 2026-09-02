import { JsonLogger } from '../common/json-logger';
import { DatabaseService } from '../database/database.service';
import { NotificationConsumerService } from '../kafka/notification-consumer.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const logger = {
    warn: jest.fn(),
  } as unknown as JsonLogger;

  it('reports readiness only when PostgreSQL and Kafka are ready', async () => {
    const database = {
      ping: jest.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseService;
    const kafka = {
      isReady: jest.fn().mockReturnValue(true),
    } as unknown as NotificationConsumerService;
    const health = new HealthService(database, kafka, logger);

    await expect(health.readiness()).resolves.toEqual({
      status: 'ok',
      service: 'notifications-api',
      components: {
        db: { status: 'up' },
        kafka: { status: 'up' },
      },
    });
  });

  it('returns a safe degraded response when PostgreSQL is unavailable', async () => {
    const database = {
      ping: jest.fn().mockRejectedValue(new Error('password secret')),
    } as unknown as DatabaseService;
    const kafka = {
      isReady: jest.fn().mockReturnValue(true),
    } as unknown as NotificationConsumerService;
    const health = new HealthService(database, kafka, logger);

    const result = await health.readiness();
    expect(result).toEqual({
      status: 'error',
      service: 'notifications-api',
      components: {
        db: { status: 'down' },
        kafka: { status: 'up' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('password secret');
  });
});
