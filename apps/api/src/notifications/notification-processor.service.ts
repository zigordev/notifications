import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Attributes, trace, TraceFlags } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import {
  errorClass,
  errorMessage,
  errorReason,
  NonRetryableNotificationError,
  NotificationProcessingBusyError,
} from '../common/errors';
import { JsonLogger } from '../observability';
import {
  notificationAttributes,
  recordSpanError,
  sendSpanAttributes,
  smtpReplyCode,
  tracer,
} from '../observability/spans';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { EmailSenderService } from '../email/email-sender.service';
import { NotificationMetricsService } from '../metrics/notification-metrics.service';
import { TemplateCatalogService } from '../templates/template-catalog.service';
import { isTerminalSuccess, NotificationEvent, parseNotificationEvent } from './notification-event';
import { NotificationRepository } from './notification.repository';

export type ProcessingResult = 'duplicate' | 'sent';

@Injectable()
export class NotificationProcessorService implements OnModuleInit {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly templates: TemplateCatalogService,
    private readonly emailSender: EmailSenderService,
    private readonly repository: NotificationRepository,
    private readonly metrics: NotificationMetricsService,
    private readonly logger: JsonLogger
  ) {}

  onModuleInit(): void {
    this.metrics.startAtZero(this.templates.templateIds(), this.config.smtp.provider);
  }

  private withSpan<T>(name: string, attributes: Attributes, run: () => Promise<T>): Promise<T> {
    return tracer().startActiveSpan(name, { attributes }, async (span) => {
      try {
        return await run();
      } catch (error) {
        recordSpanError(span, error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async process(
    rawPayload: string,
    topic: string,
    partition: number,
    offset: string
  ): Promise<ProcessingResult> {
    const event = parseNotificationEvent(rawPayload);
    this.ensureEmailChannel(event);

    const processingOwner = randomUUID();
    const claim = await this.withSpan('notification.claim', notificationAttributes(event), () =>
      this.repository.claim(
        event,
        topic,
        rawPayload,
        currentTraceId(),
        processingOwner,
        this.config.kafka.processingLeaseMs
      )
    );
    if (claim.kind === 'terminal') {
      this.metrics.duplicate(event.sourceApp, event.templateId);
      this.logger.log(
        {
          event: 'notification.duplicate',
          idempotencyKey: event.idempotencyKey,
          requestId: claim.requestId,
          topic,
          partition,
          offset,
        },
        NotificationProcessorService.name
      );
      return 'duplicate';
    }
    if (claim.kind === 'busy') {
      this.logger.debug(
        {
          event: 'notification.already_processing',
          idempotencyKey: event.idempotencyKey,
          requestId: claim.requestId,
          retryAfterMs: claim.retryAfterMs,
          topic,
          partition,
          offset,
        },
        NotificationProcessorService.name
      );
      throw new NotificationProcessingBusyError(claim.requestId, claim.retryAfterMs);
    }

    if (claim.isNew) {
      this.metrics.received(event.sourceApp, event.templateId);
    }

    const processingStartedAt = Date.now();
    let sendStartedAt: number | null = null;
    try {
      const renderStartedAt = Date.now();
      const renderedEmail = await this.withSpan(
        'notification.render',
        notificationAttributes(event),
        () => this.templates.render(event.templateId, event.data)
      );
      this.metrics.renderDuration(event.templateId, Date.now() - renderStartedAt);

      sendStartedAt = Date.now();
      await this.withSpan('smtp.send', sendSpanAttributes(event, this.config.smtp.provider), () =>
        this.emailSender.send(event.recipient.email, event.replyTo, renderedEmail)
      );
      const durationMs = Date.now() - sendStartedAt;
      await this.repository.recordAttempt(
        claim.requestId,
        this.config.smtp.provider,
        'sent',
        null,
        durationMs
      );
      await this.repository.markSent(claim.requestId, processingOwner);
      this.metrics.sendDuration(this.config.smtp.provider, event.templateId, durationMs);
      this.metrics.deliveryDuration(event.sourceApp, event.templateId, event.requestedAt);
      this.metrics.sent(event.sourceApp, event.templateId);
      this.logger.log(
        {
          event: 'notification.sent',
          requestId: claim.requestId,
          templateId: event.templateId,
          sourceApp: event.sourceApp,
          durationMs,
          topic,
          partition,
          offset,
        },
        NotificationProcessorService.name
      );
      return 'sent';
    } catch (error) {
      const durationMs = Date.now() - (sendStartedAt ?? processingStartedAt);
      const message = errorMessage(error);
      const cleanupResults = await Promise.allSettled([
        this.repository.recordAttempt(
          claim.requestId,
          this.config.smtp.provider,
          'failed',
          message,
          durationMs
        ),
        this.repository.markFailed(claim.requestId, processingOwner, message),
      ]);
      cleanupResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            {
              event:
                index === 0
                  ? 'notification.failure_audit_failed'
                  : 'notification.failure_lease_release_failed',
              requestId: claim.requestId,
              error: errorMessage(result.reason),
            },
            result.reason instanceof Error ? result.reason.stack : undefined,
            NotificationProcessorService.name
          );
        }
      });
      if (sendStartedAt !== null) {
        this.metrics.sendDuration(this.config.smtp.provider, event.templateId, durationMs);
      }
      this.metrics.failed(event.sourceApp, event.templateId);

      const fields = {
        event: 'notification.failed',
        phase: sendStartedAt === null ? 'render' : 'send',
        requestId: claim.requestId,
        templateId: event.templateId,
        sourceApp: event.sourceApp,
        topic,
        partition,
        offset,
        errorClass: errorClass(error),
        error: errorReason(error),
        ...(smtpReplyCode(error) === undefined ? {} : { smtpReplyCode: smtpReplyCode(error) }),
      };

      if (error instanceof NonRetryableNotificationError) {
        this.logger.error(
          fields,
          error instanceof Error ? error.stack : undefined,
          NotificationProcessorService.name
        );
      } else {
        this.logger.warn(fields, NotificationProcessorService.name);
      }

      throw error;
    }
  }

  async processDeadLetter(
    rawPayload: string,
    topic: string,
    partition: number,
    offset: string,
    deadLetterError = 'Message routed to DLT'
  ): Promise<void> {
    let event: NotificationEvent;
    try {
      event = parseNotificationEvent(rawPayload);
    } catch (error) {
      await this.repository.recordDeadLetter({
        rawPayload,
        topic,
        partition,
        offset,
        error: `${deadLetterError}; payload error: ${errorMessage(error)}`,
        event: null,
        requestId: null,
      });
      this.metrics.deadLetteredUnparseable();
      this.logger.error(
        {
          event: 'notification.dlt_payload_invalid',
          topic,
          partition,
          offset,
          error: errorMessage(error),
        },
        error instanceof Error ? error.stack : undefined,
        NotificationProcessorService.name
      );
      return;
    }

    const state = await this.repository.findByIdempotencyKey(event.idempotencyKey);
    await this.repository.recordDeadLetter({
      rawPayload,
      topic,
      partition,
      offset,
      error: deadLetterError,
      event,
      requestId: state?.requestId ?? null,
    });
    if (state && !isTerminalSuccess(state)) {
      await this.repository.markDeadLettered(state.requestId, 'Message routed to DLT');
    }
    this.metrics.deadLettered(event.sourceApp, event.templateId);
    this.logger.error(
      {
        event: 'notification.dead_lettered',
        requestId: state?.requestId ?? event.messageId,
        templateId: event.templateId,
        topic,
        partition,
        offset,
      },
      undefined,
      NotificationProcessorService.name
    );
  }

  private ensureEmailChannel(event: NotificationEvent): void {
    if (event.channel.toLowerCase() !== 'email') {
      throw new NonRetryableNotificationError(`Unsupported channel: ${event.channel}`);
    }
  }
}

function currentTraceId(): string {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext?.traceId) return '';
  return (spanContext.traceFlags & TraceFlags.SAMPLED) !== 0 ? spanContext.traceId : '';
}
