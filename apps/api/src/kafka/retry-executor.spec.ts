import { AppConfig } from '../config/app-config';
import { NonRetryableNotificationError, NotificationProcessingBusyError } from '../common/errors';
import { RetryExecutor } from './retry-executor';

describe('RetryExecutor', () => {
  const config = {
    kafka: {
      retryMaxAttempts: 4,
      retryIntervalMs: 5000,
    },
  } as AppConfig;

  it('uses the established four total delivery attempts', async () => {
    const sleeper = jest.fn().mockResolvedValue(undefined);
    const onRetry = jest.fn();
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue('sent');
    const executor = new RetryExecutor(config, sleeper);

    await expect(executor.execute(operation, onRetry)).resolves.toBe('sent');

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleeper).toHaveBeenCalledTimes(2);
    expect(sleeper).toHaveBeenCalledWith(5000);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, maxAttempts: 4, delayMs: 5000 })
    );
  });

  it('stops immediately for a non-retryable notification error', async () => {
    const sleeper = jest.fn().mockResolvedValue(undefined);
    const operation = jest.fn().mockRejectedValue(new NonRetryableNotificationError('invalid'));
    const executor = new RetryExecutor(config, sleeper);

    await expect(executor.execute(operation)).rejects.toThrow('invalid');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleeper).not.toHaveBeenCalled();
  });

  it('propagates the final error after all attempts', async () => {
    const sleeper = jest.fn().mockResolvedValue(undefined);
    const operation = jest.fn().mockRejectedValue(new Error('SMTP down'));
    const executor = new RetryExecutor(config, sleeper);

    await expect(executor.execute(operation)).rejects.toThrow('SMTP down');
    expect(operation).toHaveBeenCalledTimes(4);
    expect(sleeper).toHaveBeenCalledTimes(3);
  });

  it('waits for a current processing lease without spending a delivery attempt', async () => {
    const sleeper = jest.fn().mockResolvedValue(undefined);
    const onRetry = jest.fn();
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new NotificationProcessingBusyError('message-1', 47_000))
      .mockResolvedValue('sent');
    const executor = new RetryExecutor(config, sleeper);

    await expect(executor.execute(operation, onRetry)).resolves.toBe('sent');

    expect(operation).toHaveBeenNthCalledWith(1, 1);
    expect(operation).toHaveBeenNthCalledWith(2, 1);
    expect(sleeper).toHaveBeenCalledWith(47_000);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, delayMs: 47_000 }));
  });
});
