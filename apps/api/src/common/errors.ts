export class NonRetryableNotificationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NonRetryableNotificationError';
  }
}

export class NotificationProcessingBusyError extends Error {
  readonly retryAfterMs: number;

  constructor(requestId: string, retryAfterMs: number) {
    super(`Notification ${requestId} is already being processed`);
    this.name = 'NotificationProcessingBusyError';
    this.retryAfterMs = Math.max(1, retryAfterMs);
  }
}

export function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

export function errorReason(error: unknown): string {
  const [first = ''] = errorMessage(error).split('\n');
  return first.trim().slice(0, 200);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}
