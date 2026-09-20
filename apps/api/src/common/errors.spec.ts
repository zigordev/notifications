import { errorClass, errorMessage, errorReason, NonRetryableNotificationError } from './errors';

describe('errorReason', () => {
  it('keeps the first line of a reply that spans several', () => {
    const smtp = new Error(
      'Invalid login: 535-5.7.8 Username and Password not accepted.\n535 5.7.8 For more information\n535 5.7.8 go to a help page'
    );

    expect(errorReason(smtp)).toBe('Invalid login: 535-5.7.8 Username and Password not accepted.');
  });

  it('caps a reason that has no line breaks at all', () => {
    expect(errorReason(new Error('x'.repeat(500)))).toHaveLength(200);
  });

  it('reads a thrown string and gives up on anything else', () => {
    expect(errorReason('plain failure')).toBe('plain failure');
    expect(errorReason({ code: 500 })).toBe('Unknown error');
  });
});

describe('errorClass', () => {
  it('names the error rather than describing it', () => {
    expect(errorClass(new NonRetryableNotificationError('bad channel'))).toBe(
      'NonRetryableNotificationError'
    );
    expect(errorClass(new TypeError('x'))).toBe('TypeError');
    expect(errorClass('not an error')).toBe('UnknownError');
  });
});

describe('errorMessage', () => {
  it('is unchanged', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });
});
