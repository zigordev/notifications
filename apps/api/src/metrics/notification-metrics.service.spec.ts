import { Registry } from 'prom-client';
import { NotificationMetricsService } from './notification-metrics.service';

describe('NotificationMetricsService', () => {
  const metricsFor = async (record: (service: NotificationMetricsService) => void) => {
    const service = new NotificationMetricsService(new Registry());
    record(service);
    return service.registry.metrics();
  };

  it('counts what happened to a notification, by source app and template', async () => {
    const text = await metricsFor((service) => {
      service.received('cv', 'cv.contact-message');
      service.sent('cv', 'cv.contact-message');
      service.failed('gpool', 'gpool.pool-invitation');
      service.duplicate('cv', 'cv.contact-message');
      service.deadLettered('gpool', 'gpool.pool-invitation');
    });

    expect(text).toContain(
      'notifications_received_total{source_app="cv",template_id="cv.contact-message"} 1'
    );
    expect(text).toContain(
      'notifications_dlq_total{source_app="gpool",template_id="gpool.pool-invitation"} 1'
    );
  });

  it('starts every template at zero, so the first email after a start is counted', async () => {
    const text = await metricsFor((service) => {
      service.startAtZero(['cv.contact-received', 'gpool.pool-invitation'], 'gmail-smtp');
      service.received('cv', 'cv.contact-received');
    });

    expect(text).toContain(
      'notifications_received_total{source_app="cv",template_id="cv.contact-received"} 1'
    );
    expect(text).toContain(
      'notifications_sent_total{source_app="cv",template_id="cv.contact-received"} 0'
    );
    expect(text).toContain(
      'notifications_failed_total{source_app="gpool",template_id="gpool.pool-invitation"} 0'
    );
    expect(text).toContain(
      'notifications_deduplicated_total{source_app="gpool",template_id="gpool.pool-invitation"} 0'
    );
    expect(text).toContain(
      'notifications_dlq_total{source_app="cv",template_id="cv.contact-received"} 0'
    );
    expect(text).toContain(
      'notification_render_duration_seconds_count{template_id="gpool.pool-invitation"} 0'
    );
    expect(text).toContain(
      'notification_send_duration_seconds_count{provider="gmail-smtp",template_id="cv.contact-received"} 0'
    );
    expect(text).toContain(
      'notification_delivery_duration_seconds_count{source_app="gpool",template_id="gpool.pool-invitation"} 0'
    );
  });

  it('measures the whole wait, from the producer asking to the email being sent', async () => {
    const requestedAt = new Date(Date.now() - 4000).toISOString();
    const text = await metricsFor((service) =>
      service.deliveryDuration('cv', 'cv.contact-message', requestedAt)
    );

    expect(text).toContain(
      'notification_delivery_duration_seconds_count{source_app="cv",template_id="cv.contact-message"} 1'
    );
    expect(text).toMatch(/notification_delivery_duration_seconds_sum\{[^}]*} [45](\.\d+)?/);
  });

  it('records nothing rather than a nonsense delivery', async () => {
    const text = await metricsFor((service) => {
      service.deliveryDuration('cv', 'cv.contact-message', 'not a date');
      service.deliveryDuration(
        'cv',
        'cv.contact-message',
        new Date(Date.now() + 60_000).toISOString()
      );
    });

    expect(text).not.toContain('notification_delivery_duration_seconds_count');
  });

  it('keeps render and send timings apart, in seconds', async () => {
    const text = await metricsFor((service) => {
      service.renderDuration('cv.contact-message', 250);
      service.sendDuration('gmail-smtp', 'cv.contact-message', 1500);
    });

    expect(text).toContain(
      'notification_render_duration_seconds_sum{template_id="cv.contact-message"} 0.25'
    );
    expect(text).toContain(
      'notification_send_duration_seconds_sum{provider="gmail-smtp",template_id="cv.contact-message"} 1.5'
    );
  });
});
