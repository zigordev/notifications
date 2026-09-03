import { Inject, Injectable } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import {
  errorMessage,
  NonRetryableNotificationError,
  NotificationProcessingBusyError,
} from '../common/errors';
import { JsonLogger } from '../observability';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { EmailSenderService } from '../email/email-sender.service';
import { NotificationMetricsService } from '../metrics/notification-metrics.service';
import { TemplateCatalogService } from '../templates/template-catalog.service';
import { isTerminalSuccess, NotificationEvent, parseNotificationEvent } from './notification-event';
import { NotificationRepository } from './notification.repository';

export type ProcessingResult = 'duplicate' | 'sent';

@Injectable()
export class NotificationProcessorService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly templates: TemplateCatalogService,
    private readonly emailSender: EmailSenderService,
    private readonly repository: NotificationRepository,
    private readonly metrics: NotificationMetricsService,
    private readonly logger: JsonLogger
  ) {}

  async process(
    rawPayload: string,
    topic: string,
    partition: number,
    offset: string
  ): Promise<ProcessingResult> {
    const event = parseNotificationEvent(rawPayload);
    this.ensureEmailChannel(event);

    const processingOwner = randomUUID();
    const claim = await this.repository.claim(
      event,
      topic,
      rawPayload,
      currentTraceId(),
      processingOwner,
      this.config.kafka.processingLeaseMs
    );
    if (claim.kind === 'terminal') {
      this.metrics.duplicate(event.sourceApp, event.templateId);
      this.logger.log(
        {
          event: 'notification_duplicate',
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
      this.logger.log(
        {
          event: 'notification_already_processing',
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
      const renderedEmail = await this.templates.render(event.templateId, event.data);
      this.metrics.renderDuration(event.templateId, Date.now() - renderStartedAt);

      sendStartedAt = Date.now();
      await this.emailSender.send(event.recipient.email, event.replyTo, renderedEmail);
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
      this.metrics.sent(event.sourceApp, event.templateId);
      this.logger.log(
        {
          event: 'notification_sent',
          requestId: claim.requestId,
          templateId: event.templateId,
          recipient: maskEmail(event.recipient.email),
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
                  ? 'notification_failure_audit_failed'
                  : 'notification_failure_lease_release_failed',
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
      this.logger.error(
        {
          event: 'notification_processing_failed',
          phase: sendStartedAt === null ? 'render' : 'send',
          requestId: claim.requestId,
          templateId: event.templateId,
          recipient: maskEmail(event.recipient.email),
          topic,
          partition,
          offset,
          error: message,
        },
        error instanceof Error ? error.stack : undefined,
        NotificationProcessorService.name
      );
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
      this.logger.error(
        {
          event: 'notification_dlt_payload_invalid',
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
        event: 'notification_dead_lettered',
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
  return trace.getActiveSpan()?.spanContext().traceId ?? '';
}

function maskEmail(email: string): string {
  const separator = email.indexOf('@');
  if (separator <= 1) {
    return '***';
  }
  return `${email[0]}***${email.slice(separator)}`;
}
