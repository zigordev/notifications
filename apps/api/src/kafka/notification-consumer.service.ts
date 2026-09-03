import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CompressionCodecs,
  CompressionTypes,
  Consumer,
  EachBatchPayload,
  Kafka,
  KafkaMessage,
  logLevel,
  Producer,
} from 'kafkajs';
import SnappyCodec from 'kafkajs-snappy';
import { errorMessage } from '../common/errors';
import { JsonLogger, kafkaLogCreator } from '../observability';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { NotificationProcessorService } from '../notifications/notification-processor.service';
import { RetryExecutor } from './retry-executor';

CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

@Injectable()
export class NotificationConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private ready = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly processor: NotificationProcessorService,
    private readonly retryExecutor: RetryExecutor,
    private readonly logger: JsonLogger
  ) {
    const kafka = new Kafka({
      clientId: config.telemetry.serviceName,
      brokers: config.kafka.bootstrapServers,
      logLevel: logLevel.ERROR,
      // kafkajs writes its own JSON shape with no `service` field and no trace
      // context. Those are precisely the lines you want when a broker
      // disappears, and they were the only ones in the estate that a dashboard
      // filtering on `app` could not find.
      logCreator: kafkaLogCreator(),
    });
    this.consumer = kafka.consumer({
      groupId: config.kafka.consumerGroupId,
      sessionTimeout: 60_000,
      heartbeatInterval: 3000,
      allowAutoTopicCreation: true,
    });
    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      allowAutoTopicCreation: true,
    });
    this.consumer.on(this.consumer.events.GROUP_JOIN, () => {
      this.ready = true;
    });
    this.consumer.on(this.consumer.events.DISCONNECT, () => {
      this.ready = false;
    });
    this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
      this.ready = false;
      this.logger.error(
        {
          event: 'kafka_consumer_crashed',
          error: errorMessage(payload.error),
          restart: payload.restart,
        },
        payload.error.stack,
        NotificationConsumerService.name
      );
      if (!payload.restart) {
        terminateAfterConsumerCrash();
      }
    });
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [this.config.kafka.emailTopic, this.config.kafka.emailDltTopic],
      fromBeginning: true,
    });
    await this.consumer.run({
      autoCommit: false,
      eachBatchAutoResolve: false,
      partitionsConsumedConcurrently: 1,
      eachBatch: (payload) => this.processBatch(payload),
    });
    this.logger.log(
      {
        event: 'kafka_consumer_started',
        topics: [this.config.kafka.emailTopic, this.config.kafka.emailDltTopic],
        consumerGroupId: this.config.kafka.consumerGroupId,
      },
      NotificationConsumerService.name
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.ready = false;
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }

  isReady(): boolean {
    return this.ready;
  }

  private async processBatch(batchPayload: EachBatchPayload): Promise<void> {
    const { batch } = batchPayload;
    for (const message of batch.messages) {
      if (!batchPayload.isRunning() || batchPayload.isStale()) {
        return;
      }

      const payload = message.value?.toString('utf8') ?? '';
      if (batch.topic === this.config.kafka.emailDltTopic) {
        await this.processor.processDeadLetter(
          payload,
          batch.topic,
          batch.partition,
          message.offset,
          headerValue(message, 'kafka_dlt-exception-message') ?? 'Message routed to DLT'
        );
      } else {
        try {
          await this.retryExecutor.execute(
            () => this.processor.process(payload, batch.topic, batch.partition, message.offset),
            async (context) => {
              this.logger.warn(
                {
                  event: 'notification_retry_scheduled',
                  topic: batch.topic,
                  partition: batch.partition,
                  offset: message.offset,
                  attempt: context.attempt,
                  maxAttempts: context.maxAttempts,
                  delayMs: context.delayMs,
                  error: errorMessage(context.error),
                },
                NotificationConsumerService.name
              );
              await batchPayload.heartbeat();
            },
            async (durationMs) => this.waitWithHeartbeat(durationMs, () => batchPayload.heartbeat())
          );
        } catch (error) {
          await this.publishDeadLetter(batch.topic, batch.partition, message, error);
        }
      }

      batchPayload.resolveOffset(message.offset);
      await this.consumer.commitOffsets([
        {
          topic: batch.topic,
          partition: batch.partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        },
      ]);
      await batchPayload.heartbeat();
    }
  }

  private async publishDeadLetter(
    originalTopic: string,
    partition: number,
    message: KafkaMessage,
    error: unknown
  ): Promise<void> {
    const headers = {
      ...message.headers,
      'kafka_dlt-original-topic': Buffer.from(originalTopic),
      'kafka_dlt-original-partition': Buffer.from(String(partition)),
      'kafka_dlt-original-offset': Buffer.from(message.offset),
      'kafka_dlt-exception-message': Buffer.from(errorMessage(error)),
    };
    await this.producer.send({
      topic: this.config.kafka.emailDltTopic,
      acks: -1,
      messages: [
        {
          ...(message.key ? { key: message.key } : {}),
          value: message.value ?? Buffer.alloc(0),
          partition,
          headers,
        },
      ],
    });
    this.logger.error(
      {
        event: 'notification_routed_to_dlt',
        originalTopic,
        dltTopic: this.config.kafka.emailDltTopic,
        partition,
        offset: message.offset,
        error: errorMessage(error),
      },
      error instanceof Error ? error.stack : undefined,
      NotificationConsumerService.name
    );
  }

  private async waitWithHeartbeat(
    durationMs: number,
    heartbeat: () => Promise<void>
  ): Promise<void> {
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 2000)));
      await heartbeat();
    }
  }
}

export function terminateAfterConsumerCrash(): void {
  process.exitCode = 1;
  process.kill(process.pid, 'SIGTERM');
}

function headerValue(message: KafkaMessage, key: string): string | null {
  const value = message.headers?.[key];
  if (value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value[0]?.toString('utf8') ?? null;
  }
  return value.toString('utf8');
}
