import { Registry } from 'prom-client';
import { NotificationMetricsService } from './notification-metrics.service';

describe('NotificationMetricsService', () => {
  it('keeps the existing Prometheus metric names and labels', async () => {
    const metrics = new NotificationMetricsService(new Registry());

    metrics.received('gpool', 'gpool.pool-invitation');
    metrics.sent('gpool', 'gpool.pool-invitation');
    metrics.failed('gpool', 'gpool.pool-invitation');
    metrics.duplicate('gpool', 'gpool.pool-invitation');
    metrics.deadLettered('gpool', 'gpool.pool-invitation');
    metrics.renderDuration('gpool.pool-invitation', 125);
    metrics.sendDuration('gmail-smtp', 'gpool.pool-invitation', 250);

    const output = await metrics.registry.metrics();
    expect(output).toContain(
      'notifications_received_total{source_app="gpool",template_id="gpool.pool-invitation"} 1'
    );
    expect(output).toContain('notifications_sent_total');
    expect(output).toContain('notifications_failed_total');
    expect(output).toContain('notifications_deduplicated_total');
    expect(output).toContain('notifications_dlq_total');
    expect(output).toContain('notification_render_duration_seconds');
    expect(output).toContain('notification_send_duration_seconds');
  });
});
