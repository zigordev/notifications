jest.mock('kafkajs', () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const compressionCodecs: Record<number, unknown> = {};
  const consumer = {
    events: {
      GROUP_JOIN: 'GROUP_JOIN',
      DISCONNECT: 'DISCONNECT',
      CRASH: 'CRASH',
    },
    on: jest.fn((event: string, handler: (event: unknown) => void) => {
      handlers.set(event, handler);
    }),
    connect: jest.fn(),
    subscribe: jest.fn(),
    run: jest.fn(),
    disconnect: jest.fn(),
    commitOffsets: jest.fn(),
  };
  const producer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
  };
  return {
    Kafka: jest.fn(() => ({
      consumer: jest.fn(() => consumer),
      producer: jest.fn(() => producer),
    })),
    CompressionCodecs: compressionCodecs,
    CompressionTypes: { Snappy: 2 },
    logLevel: { ERROR: 1 },
    __testing: { compressionCodecs, consumer, handlers, producer },
  };
});

import { AppConfig } from '../config/app-config';
import { JsonLogger } from '../common/json-logger';
import { NotificationProcessorService } from '../notifications/notification-processor.service';
import { EachBatchPayload } from 'kafkajs';
import { RetryExecutor } from './retry-executor';
import { NotificationConsumerService } from './notification-consumer.service';

interface KafkaMockState {
  compressionCodecs: Record<number, unknown>;
  consumer: {
    commitOffsets: jest.Mock;
  };
  handlers: Map<string, (event: unknown) => void>;
}

describe('NotificationConsumerService lifecycle', () => {
  const config = {
    telemetry: { serviceName: 'notifications-api' },
    kafka: {
      bootstrapServers: ['redpanda:9092'],
      consumerGroupId: 'notifications-api',
      emailTopic: 'notification.email.requested.v1',
      emailDltTopic: 'notification.email.requested.v1.DLT',
    },
  } as AppConfig;
  const kafka = jest.requireMock<{ __testing: KafkaMockState }>('kafkajs').__testing;
  let logger: jest.Mocked<Pick<JsonLogger, 'error' | 'log' | 'warn'>>;
  let consumer: NotificationConsumerService;

  it('registers Snappy decompression for Kafka compatibility', () => {
    expect(kafka.compressionCodecs[2]).toEqual(expect.any(Function));
  });

  it('resolves each processed batch offset before committing its successor', async () => {
    const processor = {
      process: jest.fn().mockResolvedValue('sent'),
    };
    const retryExecutor = {
      execute: jest.fn(async (operation: () => Promise<unknown>) => operation()),
    };
    const offset = '7';
    const resolveOffset = jest.fn();
    const heartbeat = jest.fn().mockResolvedValue(undefined);
    const service = new NotificationConsumerService(
      config,
      processor as unknown as NotificationProcessorService,
      retryExecutor as unknown as RetryExecutor,
      logger as unknown as JsonLogger
    );
    const payload = {
      batch: {
        topic: config.kafka.emailTopic,
        partition: 1,
        messages: [{ offset, value: Buffer.from('{}') }],
      },
      isRunning: () => true,
      isStale: () => false,
      resolveOffset,
      heartbeat,
    } as unknown as EachBatchPayload;

    await (
      service as unknown as {
        processBatch: (batch: EachBatchPayload) => Promise<void>;
      }
    ).processBatch(payload);

    expect(resolveOffset).toHaveBeenCalledWith(offset);
    expect(kafka.consumer.commitOffsets).toHaveBeenCalledWith([
      {
        topic: config.kafka.emailTopic,
        partition: 1,
        offset: '8',
      },
    ]);
  });

  beforeEach(() => {
    kafka.handlers.clear();
    logger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    };
    consumer = new NotificationConsumerService(
      config,
      {} as NotificationProcessorService,
      {} as RetryExecutor,
      logger as unknown as JsonLogger
    );
  });

  it('becomes ready only after joining a consumer group', () => {
    expect(consumer.isReady()).toBe(false);

    kafka.handlers.get('GROUP_JOIN')?.({});

    expect(consumer.isReady()).toBe(true);
  });

  it('stays alive for an automatically restarting crash', () => {
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    kafka.handlers.get('GROUP_JOIN')?.({});

    kafka.handlers.get('CRASH')?.({
      payload: {
        error: new Error('temporary Kafka failure'),
        restart: true,
      },
    });

    expect(consumer.isReady()).toBe(false);
    expect(kill).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'kafka_consumer_crashed',
        restart: true,
      }),
      expect.any(String),
      NotificationConsumerService.name
    );
  });

  it('requests a clean process shutdown for a non-restarting crash', () => {
    const previousExitCode = process.exitCode;
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      kafka.handlers.get('CRASH')?.({
        payload: {
          error: new Error('fatal Kafka failure'),
          restart: false,
        },
      });

      expect(process.exitCode).toBe(1);
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
