package com.zigordev.notifications.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "notifications")
public record NotificationProperties(
    @NotBlank String kafkaBootstrapServers,
    @NotBlank String consumerGroupId,
    Email email,
    Retry retry
) {

  public record Email(
      @NotBlank String topic,
      @NotBlank String dltTopic,
      @NotBlank String provider
  ) {}

  public record Retry(
      @Positive long intervalMs,
      @Positive long maxAttempts
  ) {}
}
