import { vi } from 'vitest';
import { AppConfig } from '../config/app-config';
import { EmailSenderService } from './email-sender.service';

describe('EmailSenderService', () => {
  const config = {
    smtp: {
      from: 'notifications@example.com',
    },
  } as AppConfig;

  it('preserves from, reply-to, subject, and HTML behavior', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const sender = new EmailSenderService(config, {
      sendMail,
    });

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
    const sender = new EmailSenderService(config, {
      sendMail,
    });

    await sender.send('user@example.com', ' ', {
      subject: 'Welcome',
      html: '<p>Hello</p>',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.not.objectContaining({ replyTo: expect.anything() })
    );
  });
});
