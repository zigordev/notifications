package com.zigordev.notifications.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zigordev.notifications.config.NotificationProperties;
import com.zigordev.notifications.domain.NotificationEvent;
import com.zigordev.notifications.domain.NotificationRequestState;
import com.zigordev.notifications.mail.GmailEmailSender;
import com.zigordev.notifications.mail.RenderedEmail;
import com.zigordev.notifications.mail.TemplateCatalog;
import com.zigordev.notifications.metrics.NotificationMetrics;
import com.zigordev.notifications.repository.NotificationRepository;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
public class NotificationConsumer {
  private static final Logger logger = LoggerFactory.getLogger(NotificationConsumer.class);

  private final ObjectMapper objectMapper;
  private final Validator validator;
  private final TemplateCatalog templateCatalog;
  private final GmailEmailSender gmailEmailSender;
  private final NotificationRepository repository;
  private final NotificationMetrics metrics;
  private final NotificationProperties properties;
  private final String smtpFrom;

  public NotificationConsumer(
      ObjectMapper objectMapper,
      Validator validator,
      TemplateCatalog templateCatalog,
      GmailEmailSender gmailEmailSender,
      NotificationRepository repository,
      NotificationMetrics metrics,
      NotificationProperties properties,
      @Value("${smtp.from}") String smtpFrom
  ) {
    this.objectMapper = objectMapper;
    this.validator = validator;
    this.templateCatalog = templateCatalog;
    this.gmailEmailSender = gmailEmailSender;
    this.repository = repository;
    this.metrics = metrics;
    this.properties = properties;
    this.smtpFrom = smtpFrom;
  }

  @KafkaListener(
      topics = "${notifications.email.topic}",
      containerFactory = "notificationKafkaListenerContainerFactory"
  )
  public void consume(ConsumerRecord<String, String> consumerRecord, Acknowledgment acknowledgment) throws Exception {
    NotificationEvent event = parse(consumerRecord.value());
    validate(event);

    if (!"email".equalsIgnoreCase(event.channel())) {
      throw new IllegalArgumentException("Unsupported channel: " + event.channel());
    }

    NotificationRequestState existing = repository.findByIdempotencyKey(event.idempotencyKey()).orElse(null);
    if (existing != null && existing.isTerminalSuccess()) {
      metrics.duplicate(event.sourceApp(), event.templateId());
      logger.info(
          "Skipping duplicate notification idempotencyKey={} requestId={} topic={}",
          event.idempotencyKey(),
          existing.requestId(),
          consumerRecord.topic()
      );
      acknowledgment.acknowledge();
      return;
    }

    if (existing == null) {
      repository.insertReceived(event, consumerRecord.topic(), consumerRecord.value(), currentTraceId());
      metrics.received(event.sourceApp(), event.templateId());
    }

    Instant renderStarted = Instant.now();
    RenderedEmail renderedEmail = templateCatalog.render(event.templateId(), event.data());
    metrics.renderDuration(event.templateId(), Duration.between(renderStarted, Instant.now()));

    Instant sendStarted = Instant.now();
    try {
      gmailEmailSender.send(smtpFrom, event.recipient().email(), event.replyTo(), renderedEmail);
      long durationMs = Duration.between(sendStarted, Instant.now()).toMillis();
      repository.recordAttempt(event.messageId(), properties.email().provider(), "sent", null, durationMs);
      repository.markSent(event.messageId());
      metrics.sendDuration(properties.email().provider(), event.templateId(), Duration.ofMillis(durationMs));
      metrics.sent(event.sourceApp(), event.templateId());
      logger.info(
          "Notification sent requestId={} templateId={} recipient={} topic={} partition={} offset={}",
          event.messageId(),
          event.templateId(),
          maskEmail(event.recipient().email()),
          consumerRecord.topic(),
          consumerRecord.partition(),
          consumerRecord.offset()
      );
      acknowledgment.acknowledge();
    } catch (Exception exception) {
      long durationMs = Duration.between(sendStarted, Instant.now()).toMillis();
      repository.recordAttempt(
          event.messageId(),
          properties.email().provider(),
          "failed",
          exception.getMessage(),
          durationMs
      );
      repository.markFailed(event.messageId(), exception.getMessage());
      metrics.sendDuration(properties.email().provider(), event.templateId(), Duration.ofMillis(durationMs));
      metrics.failed(event.sourceApp(), event.templateId());
      logger.error(
          "Notification send failed requestId={} templateId={} recipient={} topic={} error={}",
          event.messageId(),
          event.templateId(),
          maskEmail(event.recipient().email()),
          consumerRecord.topic(),
          exception.getMessage()
      );
      throw exception;
    }
  }

  @KafkaListener(
      topics = "${notifications.email.dlt-topic}",
      containerFactory = "notificationKafkaListenerContainerFactory"
  )
  public void consumeDeadLetter(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) {
    try {
      NotificationEvent event = parse(record.value());
      repository.markDeadLettered(event.messageId(), "Message routed to DLT");
      metrics.deadLettered(event.sourceApp(), event.templateId());
      logger.error(
          "Notification routed to DLT requestId={} templateId={} topic={} partition={} offset={}",
          event.messageId(),
          event.templateId(),
          record.topic(),
          record.partition(),
          record.offset()
      );
    } catch (Exception exception) {
      logger.error(
          "Failed to process DLT payload topic={} partition={} offset={} error={} payload={}",
          record.topic(),
          record.partition(),
          record.offset(),
          exception.getMessage(),
          record.value()
      );
    }
    acknowledgment.acknowledge();
  }

  private NotificationEvent parse(String payload) throws JsonProcessingException {
    return objectMapper.readValue(payload, NotificationEvent.class);
  }

  private void validate(NotificationEvent event) {
    Set<ConstraintViolation<NotificationEvent>> violations = validator.validate(event);
    if (!violations.isEmpty()) {
      throw new IllegalArgumentException("Invalid notification payload: " + violations.iterator().next().getMessage());
    }
  }

  private String currentTraceId() {
    String traceId = MDC.get("traceId");
    return traceId == null ? "" : traceId;
  }

  private String maskEmail(String email) {
    int at = email.indexOf('@');
    if (at <= 1) {
      return "***";
    }
    return email.charAt(0) + "***" + email.substring(at);
  }
}
