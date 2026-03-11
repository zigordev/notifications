package com.zigordev.notifications.domain;

public record NotificationRequestState(String requestId, String status) {

  public boolean isTerminalSuccess() {
    return "sent".equalsIgnoreCase(status) || "duplicate".equalsIgnoreCase(status);
  }
}
