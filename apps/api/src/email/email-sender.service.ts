import { Inject, Injectable, InjectionToken, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { errorClass, errorReason } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { JsonLogger } from '../observability';
import { smtpReplyCode } from '../observability/spans';
import { RenderedEmail } from '../templates/template-catalog.service';

export type EmailTransport = Pick<Transporter, 'sendMail'> & Partial<Pick<Transporter, 'verify'>>;
export const EMAIL_TRANSPORT: InjectionToken<EmailTransport> = Symbol('EMAIL_TRANSPORT');

export function createEmailTransport(config: AppConfig): EmailTransport {
  const options: SMTPTransport.Options = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: false,
    requireTLS: config.smtp.startTls,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  };
  if (config.smtp.auth) {
    options.auth = {
      user: config.smtp.user,
      pass: config.smtp.password,
    };
  }
  return nodemailer.createTransport(options);
}

@Injectable()
export class EmailSenderService implements OnModuleInit, OnModuleDestroy {
  private available = true;
  private probe: NodeJS.Timeout | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
    private readonly logger: JsonLogger
  ) {}

  async onModuleInit(): Promise<void> {
    await this.verify();
    this.probe = setInterval(() => void this.verify(), this.config.smtp.probeIntervalMs);
    this.probe.unref?.();
  }

  onModuleDestroy(): void {
    if (this.probe) clearInterval(this.probe);
  }

  isAvailable(): boolean {
    return this.available;
  }

  /**
   * One authenticated round trip to the relay. A login that Gmail has revoked
   * answers 535 here, which is the difference between "nothing is being sent"
   * and knowing why before the first email is lost.
   */
  async verify(): Promise<boolean> {
    if (!this.transport.verify) return this.available;

    try {
      await this.transport.verify();
      this.markAvailable();
      return true;
    } catch (error) {
      this.markUnavailable(error);
      return false;
    }
  }

  private markAvailable(): void {
    if (!this.available) {
      this.logger.warn({ event: 'smtp.recovered' }, EmailSenderService.name);
    }
    this.available = true;
  }

  private markUnavailable(error: unknown): void {
    if (this.available) {
      this.logger.error(
        {
          event: 'smtp.unavailable',
          provider: this.config.smtp.provider,
          errorClass: errorClass(error),
          error: errorReason(error),
          ...(smtpReplyCode(error) === undefined ? {} : { smtpReplyCode: smtpReplyCode(error) }),
        },
        undefined,
        EmailSenderService.name
      );
    }
    this.available = false;
  }

  private subjectFor(subject: string): string {
    const environment = this.config.environment?.trim();
    if (!environment || environment === 'prod') {
      return subject;
    }
    return `[${environment}] ${subject}`;
  }

  async send(to: string, replyTo: string | null | undefined, email: RenderedEmail): Promise<void> {
    const message = {
      from: this.config.smtp.from,
      to,
      subject: this.subjectFor(email.subject),
      html: email.html,
      ...(replyTo?.trim() ? { replyTo } : {}),
    };
    try {
      await this.transport.sendMail(message);
      this.markAvailable();
    } catch (error) {
      if (isRelayFailure(error)) this.markUnavailable(error);
      throw error;
    }
  }
}

const RELAY_REPLY_CODES = new Set([421, 450, 451, 452, 454, 530, 534, 535]);

/**
 * A rejection that says the relay itself is unusable, rather than this one
 * message being wrong. A 5xx reply about the message is not an outage; a
 * refused connection, a timeout or a rejected login is.
 */
export function isRelayFailure(error: unknown): boolean {
  const code = smtpReplyCode(error);

  // A rejection with no SMTP reply at all never reached the relay: a refused
  // connection, a DNS failure, a timeout.
  if (code === undefined) return true;

  return RELAY_REPLY_CODES.has(code);
}
