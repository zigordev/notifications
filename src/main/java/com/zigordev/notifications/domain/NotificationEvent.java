package com.zigordev.notifications.domain;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.Map;

public record NotificationEvent(
    @NotBlank String messageId,
    @NotBlank String idempotencyKey,
    @NotBlank String sourceApp,
    @NotBlank String channel,
    @NotBlank String templateId,
    @Email String replyTo,
    @Valid Recipient recipient,
    @NotEmpty Map<String, Object> data,
    Map<String, Object> metadata,
    @NotBlank String requestedAt
) {

  public record Recipient(@Email @NotBlank String email) {}
}
