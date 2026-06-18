package com.zigordev.notifications.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class NotificationMetrics {
  private final MeterRegistry meterRegistry;

  private static final String TEMPLATE_ID = "template_id";

  public NotificationMetrics(MeterRegistry meterRegistry) {
    this.meterRegistry = meterRegistry;
  }

  public void received(String sourceApp, String templateId) {
    counter("notifications_received", sourceApp, templateId).increment();
  }

  public void sent(String sourceApp, String templateId) {
    counter("notifications_sent", sourceApp, templateId).increment();
  }

  public void failed(String sourceApp, String templateId) {
    counter("notifications_failed", sourceApp, templateId).increment();
  }

  public void duplicate(String sourceApp, String templateId) {
    counter("notifications_deduplicated", sourceApp, templateId).increment();
  }

  public void deadLettered(String sourceApp, String templateId) {
    counter("notifications_dlq", sourceApp, templateId).increment();
  }

  public void renderDuration(String templateId, Duration duration) {
    Timer.builder("notification_render_duration")
        .tag(TEMPLATE_ID, templateId)
        .register(meterRegistry)
        .record(duration);
  }

  public void sendDuration(String provider, String templateId, Duration duration) {
    Timer.builder("notification_send_duration")
        .tag("provider", provider)
        .tag(TEMPLATE_ID, templateId)
        .register(meterRegistry)
        .record(duration);
  }

  private Counter counter(String name, String sourceApp, String templateId) {
    return Counter.builder(name)
        .tag("source_app", sourceApp)
        .tag(TEMPLATE_ID, templateId)
        .register(meterRegistry);
  }
}
