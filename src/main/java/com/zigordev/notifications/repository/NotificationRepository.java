package com.zigordev.notifications.repository;

import com.zigordev.notifications.domain.NotificationEvent;
import com.zigordev.notifications.domain.NotificationRequestState;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationRepository {
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public NotificationRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public Optional<NotificationRequestState> findByIdempotencyKey(String idempotencyKey) {
    return jdbcTemplate.query(
        """
        SELECT request_id, status
        FROM notification_requests
        WHERE idempotency_key = ?
        LIMIT 1
        """,
        ps -> ps.setString(1, idempotencyKey),
        rs -> {
          if (!rs.next()) {
            return Optional.empty();
          }
          return Optional.of(new NotificationRequestState(
              rs.getString("request_id"),
              rs.getString("status")
          ));
        }
    );
  }

  public void insertReceived(NotificationEvent event, String topic, String rawPayload, String traceId) {
    jdbcTemplate.update(
        """
        INSERT INTO notification_requests (
          request_id,
          idempotency_key,
          topic,
          source_app,
          channel,
          template_id,
          recipient_email,
          payload_json,
          status,
          trace_id,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, 'received', ?, NOW())
        ON CONFLICT (request_id) DO NOTHING
        """,
        event.messageId(),
        event.idempotencyKey(),
        topic,
        event.sourceApp(),
        event.channel(),
        event.templateId(),
        event.recipient().email(),
        rawPayload,
        traceId
    );
  }

  public void recordAttempt(String requestId, String provider, String status, String errorMessage, long durationMs) {
    jdbcTemplate.update(
        """
        INSERT INTO notification_attempts (
          attempt_id,
          request_id,
          provider,
          status,
          error_message,
          duration_ms,
          attempted_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
        """,
        UUID.randomUUID().toString(),
        requestId,
        provider,
        status,
        errorMessage,
        durationMs
    );
  }

  public void markSent(String requestId) {
    jdbcTemplate.update(
        """
        UPDATE notification_requests
        SET status = 'sent', processed_at = NOW(), error_message = NULL
        WHERE request_id = ?
        """,
        requestId
    );
  }

  public void markFailed(String requestId, String errorMessage) {
    jdbcTemplate.update(
        """
        UPDATE notification_requests
        SET status = 'failed', processed_at = NOW(), error_message = ?
        WHERE request_id = ?
        """,
        truncate(errorMessage),
        requestId
    );
  }

  public void markDeadLettered(String requestId, String errorMessage) {
    jdbcTemplate.update(
        """
        UPDATE notification_requests
        SET status = 'dead_lettered', processed_at = NOW(), error_message = ?
        WHERE request_id = ?
        """,
        truncate(errorMessage),
        requestId
    );
  }

  public String serialize(NotificationEvent event) {
    try {
      return objectMapper.writeValueAsString(event);
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException("Failed to serialize notification payload", exception);
    }
  }

  private String truncate(String value) {
    if (value == null) {
      return null;
    }
    return value.length() <= 2_000 ? value : value.substring(0, 2_000);
  }
}
