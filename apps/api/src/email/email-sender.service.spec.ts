import { vi } from 'vitest';
import { AppConfig } from '../config/app-config';
import { EmailSenderService, isRelayFailure } from './email-sender.service';

describe('EmailSenderService', () => {
  const logger = { log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
  const config = {
    environment: 'prod',
    smtp: {
      from: 'notifications@example.com',
    },
  } as AppConfig;

  it('preserves from, reply-to, subject, and HTML behavior', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const sender = new EmailSenderService(config, { sendMail }, logger);

    await sender.send('user@example.com', 'support@example.com', {
      subject: 'Welcome',
      html: '<p>Hello</p>',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'notifications@example.com',
      to: 'user@example.com',
      replyTo: 'support@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
    });
  });

  it('does not add a blank reply-to header', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const sender = new EmailSenderService(config, { sendMail }, logger);

    await sender.send('user@example.com', ' ', {
      subject: 'Welcome',
      html: '<p>Hello</p>',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.not.objectContaining({ replyTo: expect.anything() })
    );
  });

  it('tags the subject with the environment outside prod', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const sender = new EmailSenderService(
      { ...config, environment: 'local' },
      { sendMail },
      logger
    );

    await sender.send('user@example.com', null, {
      subject: 'Welcome',
      html: '<p>Hello</p>',
    });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: '[local] Welcome' }));
  });

  it('leaves the subject untouched in prod', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const sender = new EmailSenderService(config, { sendMail }, logger);

    await sender.send('user@example.com', null, {
      subject: 'Welcome',
      html: '<p>Hello</p>',
    });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Welcome' }));
  });
});

describe('relay availability', () => {
  const logger = { log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config = {
    environment: 'prod',
    smtp: { from: 'notifications@example.com', provider: 'gmail-smtp', probeIntervalMs: 60_000 },
  } as AppConfig;

  it('goes unavailable when the relay refuses the login, and says so once', async () => {
    const rejection = Object.assign(new Error('Invalid login: 535-5.7.8 nope\n535 more'), {
      responseCode: 535,
    });
    const sender = new EmailSenderService(
      config,
      { sendMail: vi.fn(), verify: vi.fn().mockRejectedValue(rejection) },
      logger as never
    );

    await expect(sender.verify()).resolves.toBe(false);
    await expect(sender.verify()).resolves.toBe(false);

    expect(sender.isAvailable()).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'smtp.unavailable',
        smtpReplyCode: 535,
        error: 'Invalid login: 535-5.7.8 nope',
      }),
      undefined,
      expect.any(String)
    );
  });

  it('comes back when the relay answers again', async () => {
    const verify = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue(true);
    const sender = new EmailSenderService(config, { sendMail: vi.fn(), verify }, logger as never);

    await sender.verify();
    expect(sender.isAvailable()).toBe(false);

    await sender.verify();
    expect(sender.isAvailable()).toBe(true);
  });

  it('stays available when a single message is rejected rather than the relay', async () => {
    const rejection = Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 });
    const sender = new EmailSenderService(
      config,
      { sendMail: vi.fn().mockRejectedValue(rejection) },
      logger as never
    );

    await expect(
      sender.send('user@example.com', null, { subject: 'x', html: '<p>x</p>' })
    ).rejects.toThrow('550');

    expect(sender.isAvailable()).toBe(true);
  });
});

describe('isRelayFailure', () => {
  it('treats a refused connection or a timeout as the relay being unusable', () => {
    expect(isRelayFailure(new Error('connect ECONNREFUSED'))).toBe(true);
    expect(isRelayFailure(new Error('Greeting never received'))).toBe(true);
  });

  it('treats a rejected login or a busy relay as the relay being unusable', () => {
    expect(isRelayFailure(Object.assign(new Error('x'), { responseCode: 535 }))).toBe(true);
    expect(isRelayFailure(Object.assign(new Error('x'), { responseCode: 421 }))).toBe(true);
  });

  it('treats a rejection about one message as that message being wrong', () => {
    expect(isRelayFailure(Object.assign(new Error('x'), { responseCode: 550 }))).toBe(false);
    expect(isRelayFailure(Object.assign(new Error('x'), { responseCode: 552 }))).toBe(false);
  });
});

describe('the relay probe', () => {
  const logger = { log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

  it('verifies once at startup and then on a timer, and stops when the service does', async () => {
    vi.useFakeTimers();
    const verify = vi.fn().mockResolvedValue(true);
    const sender = new EmailSenderService(
      {
        environment: 'prod',
        smtp: { from: 'x@example.com', provider: 'gmail-smtp', probeIntervalMs: 60_000 },
      } as AppConfig,
      { sendMail: vi.fn(), verify },
      logger as never
    );

    try {
      await sender.onModuleInit();
      expect(verify).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(180_000);
      expect(verify).toHaveBeenCalledTimes(4);

      sender.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(verify).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('assumes the relay is usable when the transport cannot be verified at all', async () => {
    const sender = new EmailSenderService(
      {
        environment: 'prod',
        smtp: { from: 'x@example.com', provider: 'gmail-smtp', probeIntervalMs: 60_000 },
      } as AppConfig,
      { sendMail: vi.fn() },
      logger as never
    );

    await expect(sender.verify()).resolves.toBe(true);
    expect(sender.isAvailable()).toBe(true);
  });
});
