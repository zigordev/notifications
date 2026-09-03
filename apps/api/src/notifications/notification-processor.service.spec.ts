import { vi, type Mocked } from 'vitest';
import { AppConfig } from '../config/app-config';
import { EmailSenderService } from '../email/email-sender.service';
import { JsonLogger } from '../observability';
import { NonRetryableNotificationError, NotificationProcessingBusyError } from '../common/errors';
import { NotificationMetricsService } from '../metrics/notification-metrics.service';
import { TemplateCatalogService } from '../templates/template-catalog.service';
import { NotificationProcessorService } from './notification-processor.service';
import { NotificationRepository } from './notification.repository';

const payload = JSON.stringify({
  messageId: 'message-1',
  idempotencyKey: 'invitation-1',
  sourceApp: 'gpool',
  channel: 'email',
  templateId: 'gpool.pool-invitation',
  recipient: { email: 'user@example.com' },
  data: { poolName: 'Pool' },
  metadata: {},
  requestedAt: '2026-03-11T00:00:00Z',
});

describe('NotificationProcessorService', () => {
  const config = {
    kafka: {
      processingLeaseMs: 60_000,
    },
    smtp: {
      provider: 'gmail-smtp',
    },
  } as AppConfig;
  let templates: Mocked<Pick<TemplateCatalogService, 'render'>>;
  let emailSender: Mocked<Pick<EmailSenderService, 'send'>>;
  let repository: Mocked<
    Pick<
      NotificationRepository,
      | 'claim'
      | 'findByIdempotencyKey'
      | 'recordAttempt'
      | 'markSent'
      | 'markFailed'
      | 'markDeadLettered'
      | 'recordDeadLetter'
    >
  >;
  let metrics: Mocked<
    Pick<
      NotificationMetricsService,
      | 'received'
      | 'sent'
      | 'failed'
      | 'duplicate'
      | 'deadLettered'
      | 'renderDuration'
      | 'sendDuration'
    >
  >;
  let logger: Mocked<Pick<JsonLogger, 'log' | 'error'>>;
  let processor: NotificationProcessorService;

  beforeEach(() => {
    templates = {
      render: vi.fn().mockResolvedValue({
        subject: 'Invitation',
        html: '<p>Invitation</p>',
      }),
    };
    emailSender = {
      send: vi.fn().mockResolvedValue(undefined),
    };
    repository = {
      claim: vi.fn().mockResolvedValue({
        kind: 'claimed',
        requestId: 'message-1',
        isNew: true,
      }),
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      recordAttempt: vi.fn().mockResolvedValue(undefined),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      markDeadLettered: vi.fn().mockResolvedValue(undefined),
      recordDeadLetter: vi.fn().mockResolvedValue(undefined),
    };
    metrics = {
      received: vi.fn(),
      sent: vi.fn(),
      failed: vi.fn(),
      duplicate: vi.fn(),
      deadLettered: vi.fn(),
      renderDuration: vi.fn(),
      sendDuration: vi.fn(),
    };
    logger = {
      log: vi.fn(),
      error: vi.fn(),
    };
    processor = new NotificationProcessorService(
      config,
      templates as unknown as TemplateCatalogService,
      emailSender as unknown as EmailSenderService,
      repository as unknown as NotificationRepository,
      metrics as unknown as NotificationMetricsService,
      logger as unknown as JsonLogger
    );
  });

  it('persists, renders, sends, and audits a new request', async () => {
    await expect(
      processor.process(payload, 'notification.email.requested.v1', 0, '10')
    ).resolves.toBe('sent');

    expect(repository.claim).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'message-1' }),
      'notification.email.requested.v1',
      payload,
      expect.any(String),
      expect.any(String),
      config.kafka.processingLeaseMs
    );
    expect(emailSender.send).toHaveBeenCalledWith('user@example.com', undefined, {
      subject: 'Invitation',
      html: '<p>Invitation</p>',
    });
    expect(repository.recordAttempt).toHaveBeenCalledWith(
      'message-1',
      'gmail-smtp',
      'sent',
      null,
      expect.any(Number)
    );
    expect(repository.markSent).toHaveBeenCalledWith('message-1', expect.any(String));
    expect(metrics.received).toHaveBeenCalledWith('gpool', 'gpool.pool-invitation');
    expect(metrics.sent).toHaveBeenCalledWith('gpool', 'gpool.pool-invitation');
  });

  it('acknowledges a terminal duplicate without rendering or sending', async () => {
    repository.claim.mockResolvedValue({
      kind: 'terminal',
      requestId: 'original-message',
      status: 'sent',
    });

    await expect(
      processor.process(payload, 'notification.email.requested.v1', 0, '11')
    ).resolves.toBe('duplicate');

    expect(templates.render).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(metrics.duplicate).toHaveBeenCalled();
  });

  it('retries a failed idempotency key against its original request id', async () => {
    repository.claim.mockResolvedValue({
      kind: 'claimed',
      requestId: 'original-message',
      isNew: false,
    });

    await processor.process(payload, 'notification.email.requested.v1', 0, '12');

    expect(repository.recordAttempt).toHaveBeenCalledWith(
      'original-message',
      'gmail-smtp',
      'sent',
      null,
      expect.any(Number)
    );
    expect(repository.markSent).toHaveBeenCalledWith('original-message', expect.any(String));
  });

  it('records failed delivery attempts before propagating the SMTP error', async () => {
    emailSender.send.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(
      processor.process(payload, 'notification.email.requested.v1', 0, '13')
    ).rejects.toThrow('SMTP unavailable');

    expect(repository.recordAttempt).toHaveBeenCalledWith(
      'message-1',
      'gmail-smtp',
      'failed',
      'SMTP unavailable',
      expect.any(Number)
    );
    expect(repository.markFailed).toHaveBeenCalledWith(
      'message-1',
      expect.any(String),
      'SMTP unavailable'
    );
    expect(metrics.failed).toHaveBeenCalled();
  });

  it('releases the processing lease and audits a non-retryable render failure', async () => {
    templates.render.mockRejectedValue(
      new NonRetryableNotificationError('Failed to render template')
    );

    await expect(
      processor.process(payload, 'notification.email.requested.v1', 0, '14')
    ).rejects.toBeInstanceOf(NonRetryableNotificationError);

    expect(emailSender.send).not.toHaveBeenCalled();
    expect(repository.recordAttempt).toHaveBeenCalledWith(
      'message-1',
      'gmail-smtp',
      'failed',
      'Failed to render template',
      expect.any(Number)
    );
    expect(repository.markFailed).toHaveBeenCalledWith(
      'message-1',
      expect.any(String),
      'Failed to render template'
    );
    expect(metrics.failed).toHaveBeenCalledWith('gpool', 'gpool.pool-invitation');
  });

  it('does not acknowledge a request while another processing lease is current', async () => {
    repository.claim.mockResolvedValue({
      kind: 'busy',
      requestId: 'message-1',
      status: 'processing',
      retryAfterMs: 47_000,
    });

    await expect(
      processor.process(payload, 'notification.email.requested.v1', 0, '15')
    ).rejects.toMatchObject({
      name: 'NotificationProcessingBusyError',
      retryAfterMs: 47_000,
    });

    expect(templates.render).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(metrics.duplicate).not.toHaveBeenCalled();
  });

  it('audits a DLT record against the idempotent request', async () => {
    repository.findByIdempotencyKey.mockResolvedValue({
      requestId: 'original-message',
      status: 'failed',
    });

    await processor.processDeadLetter(payload, 'notification.email.requested.v1.DLT', 0, '16');

    expect(repository.markDeadLettered).toHaveBeenCalledWith(
      'original-message',
      'Message routed to DLT'
    );
    expect(metrics.deadLettered).toHaveBeenCalledWith('gpool', 'gpool.pool-invitation');
    expect(repository.recordDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'original-message',
        rawPayload: payload,
      })
    );
  });

  it('audits a late DLT record without downgrading a sent request', async () => {
    repository.findByIdempotencyKey.mockResolvedValue({
      requestId: 'original-message',
      status: 'sent',
    });

    await processor.processDeadLetter(payload, 'notification.email.requested.v1.DLT', 0, '17');

    expect(repository.recordDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'original-message' })
    );
    expect(repository.markDeadLettered).not.toHaveBeenCalled();
    expect(metrics.deadLettered).toHaveBeenCalledWith('gpool', 'gpool.pool-invitation');
  });

  it('persists malformed dead-letter payloads without requiring a request row', async () => {
    await processor.processDeadLetter(
      '{not-json',
      'notification.email.requested.v1.DLT',
      1,
      '18',
      'Invalid original payload'
    );

    expect(repository.recordDeadLetter).toHaveBeenCalledTimes(1);
    expect(repository.recordDeadLetter.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        rawPayload: '{not-json',
        topic: 'notification.email.requested.v1.DLT',
        partition: 1,
        offset: '18',
        event: null,
        requestId: null,
      })
    );
    expect(repository.recordDeadLetter.mock.calls[0]?.[0].error).toContain(
      'Invalid original payload'
    );
  });

  it('allows only one SMTP send and keeps the in-flight duplicate unacknowledged', async () => {
    let claimed = false;
    repository.claim.mockImplementation(() => {
      if (claimed) {
        return Promise.resolve({
          kind: 'busy',
          requestId: 'message-1',
          status: 'processing',
          retryAfterMs: 60_000,
        });
      }
      claimed = true;
      return Promise.resolve({
        kind: 'claimed',
        requestId: 'message-1',
        isNew: true,
      });
    });

    const results = await Promise.allSettled([
      processor.process(payload, 'notification.email.requested.v1', 0, '20'),
      processor.process(payload, 'notification.email.requested.v1', 1, '21'),
    ]);

    expect(repository.claim).toHaveBeenCalledTimes(2);
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fulfilled', value: 'sent' }),
        expect.objectContaining({
          status: 'rejected',
          reason: expect.any(NotificationProcessingBusyError),
        }),
      ])
    );
  });
});
