import { Inject, Injectable, Optional } from '@nestjs/common';
import { NonRetryableNotificationError, NotificationProcessingBusyError } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
}

type Sleeper = (durationMs: number) => Promise<void>;

@Injectable()
export class RetryExecutor {
  private readonly maxAttempts: number;
  private readonly intervalMs: number;
  private readonly sleeper: Sleeper;

  constructor(@Inject(APP_CONFIG) config: AppConfig, @Optional() sleeper?: Sleeper) {
    this.maxAttempts = config.kafka.retryMaxAttempts;
    this.intervalMs = config.kafka.retryIntervalMs;
    this.sleeper = sleeper ?? sleep;
  }

  async execute<T>(
    operation: (attempt: number) => Promise<T>,
    onRetry?: (context: RetryContext) => Promise<void> | void,
    wait: Sleeper = this.sleeper
  ): Promise<T> {
    let attempt = 1;
    while (attempt <= this.maxAttempts) {
      try {
        return await operation(attempt);
      } catch (error) {
        const processingBusy = error instanceof NotificationProcessingBusyError;
        if (
          error instanceof NonRetryableNotificationError ||
          (!processingBusy && attempt === this.maxAttempts)
        ) {
          throw error;
        }
        const delayMs = processingBusy ? error.retryAfterMs : this.intervalMs;
        await onRetry?.({
          attempt,
          maxAttempts: this.maxAttempts,
          delayMs,
          error,
        });
        await wait(delayMs);
        if (!processingBusy) {
          attempt += 1;
        }
      }
    }
    throw new Error('Retry executor reached an unreachable state');
  }
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
