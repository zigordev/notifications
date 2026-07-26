import { errorMessage, NonRetryableNotificationError } from './errors';

describe('notification errors', () => {
  it('distinguishes non-retryable errors', () => {
    expect(new NonRetryableNotificationError('invalid')).toMatchObject({
      name: 'NonRetryableNotificationError',
      message: 'invalid',
    });
  });

  it.each([
    [new Error('failure'), 'failure'],
    ['failure', 'failure'],
    [{ code: 'failure' }, 'Unknown error'],
    [null, 'Unknown error'],
  ])('normalizes error messages', (error, expected) => {
    expect(errorMessage(error)).toBe(expected);
  });
});
