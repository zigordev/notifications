import { Injectable, Optional } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

const UNPARSEABLE_LABELS = { source_app: 'unknown', template_id: 'unknown' } as const;

const DEAD_LETTER_PUBLISH_OUTCOMES = ['retried', 'exhausted'] as const;

export type DeadLetterPublishOutcome = (typeof DEAD_LETTER_PUBLISH_OUTCOMES)[number];

@Injectable()
export class NotificationMetricsService {
  readonly registry: Registry;
  private readonly receivedCounter: Counter<'source_app' | 'template_id'>;
  private readonly sentCounter: Counter<'source_app' | 'template_id'>;
  private readonly failedCounter: Counter<'source_app' | 'template_id'>;
  private readonly deduplicatedCounter: Counter<'source_app' | 'template_id'>;
  private readonly deadLetterCounter: Counter<'source_app' | 'template_id'>;
  private readonly deadLetterPublishFailureCounter: Counter<'outcome'>;
  private readonly renderDurationHistogram: Histogram<'template_id'>;
  private readonly sendDurationHistogram: Histogram<'provider' | 'template_id'>;
  private readonly deliveryDurationHistogram: Histogram<'source_app' | 'template_id'>;

  /**
   * The registry comes from `ObservabilityModule`, so these metrics and the
   * process defaults are served by one `/metrics` scrape.
   *
   * `collectDefaultMetrics` is deliberately NOT called here — the shared
   * registry already collects them, and calling it twice on the same registry
   * makes prom-client throw on a duplicate metric name. The optional fallback
   * is for tests, which want an empty registry to assert against.
   */
  constructor(@Optional() registry?: Registry) {
    this.registry = registry ?? new Registry();
    this.receivedCounter = new Counter({
      name: 'notifications_received_total',
      help: 'Number of notification requests accepted for processing.',
      labelNames: ['source_app', 'template_id'],
      registers: [this.registry],
    });
    this.sentCounter = new Counter({
      name: 'notifications_sent_total',
      help: 'Number of notifications delivered successfully.',
      labelNames: ['source_app', 'template_id'],
      registers: [this.registry],
    });
    this.failedCounter = new Counter({
      name: 'notifications_failed_total',
      help: 'Number of failed notification delivery attempts.',
      labelNames: ['source_app', 'template_id'],
      registers: [this.registry],
    });
    this.deduplicatedCounter = new Counter({
      name: 'notifications_deduplicated_total',
      help: 'Number of terminal duplicate notification requests skipped.',
      labelNames: ['source_app', 'template_id'],
      registers: [this.registry],
    });
    this.deadLetterCounter = new Counter({
      name: 'notifications_dlq_total',
      help: 'Number of notification requests observed on the dead-letter topic.',
      labelNames: ['source_app', 'template_id'],
      registers: [this.registry],
    });
    this.deadLetterPublishFailureCounter = new Counter({
      name: 'notifications_dlq_publish_failures_total',
      help: 'Failed attempts to publish a failed notification onto the dead-letter topic.',
      labelNames: ['outcome'],
      registers: [this.registry],
    });
    this.renderDurationHistogram = new Histogram({
      name: 'notification_render_duration_seconds',
      help: 'Time spent rendering a notification template.',
      labelNames: ['template_id'],
      registers: [this.registry],
    });
    this.sendDurationHistogram = new Histogram({
      name: 'notification_send_duration_seconds',
      help: 'Time spent sending a notification through a provider.',
      labelNames: ['provider', 'template_id'],
      registers: [this.registry],
    });
    this.deliveryDurationHistogram = new Histogram({
      name: 'notification_delivery_duration_seconds',
      help: 'Time from the producer asking for a notification to it being sent.',
      labelNames: ['source_app', 'template_id'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
      registers: [this.registry],
    });
  }

  startAtZero(templateIds: readonly string[], provider: string): void {
    for (const templateId of templateIds) {
      const [sourceApp = templateId] = templateId.split('.');
      const labels = { source_app: sourceApp, template_id: templateId };
      for (const counter of [
        this.receivedCounter,
        this.sentCounter,
        this.failedCounter,
        this.deduplicatedCounter,
        this.deadLetterCounter,
      ]) {
        counter.inc(labels, 0);
      }
      this.renderDurationHistogram.zero({ template_id: templateId });
      this.sendDurationHistogram.zero({ provider, template_id: templateId });
      this.deliveryDurationHistogram.zero(labels);
    }
    this.deadLetterCounter.inc(UNPARSEABLE_LABELS, 0);
    for (const outcome of DEAD_LETTER_PUBLISH_OUTCOMES) {
      this.deadLetterPublishFailureCounter.inc({ outcome }, 0);
    }
  }

  received(sourceApp: string, templateId: string): void {
    this.receivedCounter.inc({
      source_app: sourceApp,
      template_id: templateId,
    });
  }

  sent(sourceApp: string, templateId: string): void {
    this.sentCounter.inc({
      source_app: sourceApp,
      template_id: templateId,
    });
  }

  failed(sourceApp: string, templateId: string): void {
    this.failedCounter.inc({
      source_app: sourceApp,
      template_id: templateId,
    });
  }

  duplicate(sourceApp: string, templateId: string): void {
    this.deduplicatedCounter.inc({
      source_app: sourceApp,
      template_id: templateId,
    });
  }

  deadLettered(sourceApp: string, templateId: string): void {
    this.deadLetterCounter.inc({
      source_app: sourceApp,
      template_id: templateId,
    });
  }

  deadLetteredUnparseable(): void {
    this.deadLetterCounter.inc(UNPARSEABLE_LABELS);
  }

  deadLetterPublishFailed(outcome: DeadLetterPublishOutcome): void {
    this.deadLetterPublishFailureCounter.inc({ outcome });
  }

  renderDuration(templateId: string, durationMs: number): void {
    this.renderDurationHistogram.observe({ template_id: templateId }, durationMs / 1000);
  }

  sendDuration(provider: string, templateId: string, durationMs: number): void {
    this.sendDurationHistogram.observe({ provider, template_id: templateId }, durationMs / 1000);
  }

  deliveryDuration(sourceApp: string, templateId: string, requestedAt: string): void {
    const requested = Date.parse(requestedAt);
    if (Number.isNaN(requested)) return;

    const seconds = (Date.now() - requested) / 1000;
    if (seconds < 0) return;

    this.deliveryDurationHistogram.observe(
      { source_app: sourceApp, template_id: templateId },
      seconds
    );
  }
}
