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
import { context as otelContext, propagation, SpanKind } from '@opentelemetry/api';
import { errorClass, errorMessage, errorReason } from '../common/errors';
import { JsonLogger, kafkaLogCreator } from '../observability';
import {
  consumeSpanAttributes,
  kafkaTextHeaders,
  recordSpanError,
  tracer,
} from '../observability/spans';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { EmailSenderService } from '../email/email-sender.service';
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
    private readonly emailSender: EmailSenderService,
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
      const crash = {
        event: 'kafka.consumer_crashed',
        errorClass: errorClass(payload.error),
        error: errorReason(payload.error),
        restart: payload.restart,
      };

      // kafkajs rejoins the group on its own when it says it will restart.
      // Paging on that would page on every rebalance; only a crash it cannot
      // come back from is an error.
      if (payload.restart) {
        this.logger.warn(crash, NotificationConsumerService.name);
      } else {
        this.logger.error(crash, payload.error.stack, NotificationConsumerService.name);
      }
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
        event: 'kafka.consumer_started',
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

      const handled = await this.traceMessage(batchPayload, message);

      // The relay is down and the message is still in the topic. Leaving the
      // offset where it is redelivers it when the pause lifts, which is the
      // difference between an outage and a morning of dead-lettered email.
      if (!handled) return;

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

  private traceMessage(batchPayload: EachBatchPayload, message: KafkaMessage): Promise<boolean> {
    const { batch } = batchPayload;
    const parent = propagation.extract(otelContext.active(), kafkaTextHeaders(message.headers));

    return tracer().startActiveSpan(
      'notification.process',
      {
        kind: SpanKind.CONSUMER,
        attributes: consumeSpanAttributes(batch.topic, batch.partition, message.offset),
      },
      parent,
      async (span) => {
        try {
          return await this.handleMessage(batchPayload, message);
        } catch (error) {
          recordSpanError(span, error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }

  private async handleMessage(
    batchPayload: EachBatchPayload,
    message: KafkaMessage
  ): Promise<boolean> {
    const { batch } = batchPayload;
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
                event: 'notification.retry_scheduled',
                topic: batch.topic,
                partition: batch.partition,
                offset: message.offset,
                attempt: context.attempt,
                maxAttempts: context.maxAttempts,
                delayMs: context.delayMs,
                errorClass: errorClass(context.error),
                error: errorReason(context.error),
              },
              NotificationConsumerService.name
            );
            await batchPayload.heartbeat();
          },
          async (durationMs) => this.waitWithHeartbeat(durationMs, () => batchPayload.heartbeat())
        );
      } catch (error) {
        if (!this.emailSender.isAvailable()) {
          this.pauseForRelayOutage(batch.topic, batch.partition, message.offset, error);
          return false;
        }

        await this.publishDeadLetter(batch.topic, batch.partition, message, error);
      }
    }

    return true;
  }

  /**
   * Stop consuming while the relay is unusable. kafkajs redelivers from the
   * last committed offset when the pause lifts, so nothing is lost and nothing
   * is dead-lettered for a failure that has nothing to do with the message.
   */
  private pauseForRelayOutage(
    topic: string,
    partition: number,
    offset: string,
    error: unknown
  ): void {
    const backoffMs = this.config.smtp.outageBackoffMs;

    this.consumer.pause([{ topic }]);
    const resume = setTimeout(() => this.consumer.resume([{ topic }]), backoffMs);
    resume.unref?.();

    this.logger.warn(
      {
        event: 'notification.paused_for_relay',
        topic,
        partition,
        offset,
        backoffMs,
        errorClass: errorClass(error),
        error: errorReason(error),
      },
      NotificationConsumerService.name
    );
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
    // One error line per email that is given up on, and this is not it: the
    // `notification.dead_lettered` line written when the DLT topic is consumed
    // is. This one says where the message went.
    this.logger.warn(
      {
        event: 'notification.routed_to_dlt',
        originalTopic,
        dltTopic: this.config.kafka.emailDltTopic,
        partition,
        offset: message.offset,
        errorClass: errorClass(error),
        error: errorReason(error),
      },
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
