import { Injectable, Optional } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class NotificationMetricsService {
  readonly registry: Registry;
  private readonly receivedCounter: Counter<'source_app' | 'template_id'>;
  private readonly sentCounter: Counter<'source_app' | 'template_id'>;
  private readonly failedCounter: Counter<'source_app' | 'template_id'>;
  private readonly deduplicatedCounter: Counter<'source_app' | 'template_id'>;
  private readonly deadLetterCounter: Counter<'source_app' | 'template_id'>;
  private readonly renderDurationHistogram: Histogram<'template_id'>;
  private readonly sendDurationHistogram: Histogram<'provider' | 'template_id'>;

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

  renderDuration(templateId: string, durationMs: number): void {
    this.renderDurationHistogram.observe({ template_id: templateId }, durationMs / 1000);
  }

  sendDuration(provider: string, templateId: string, durationMs: number): void {
    this.sendDurationHistogram.observe({ provider, template_id: templateId }, durationMs / 1000);
  }
}
