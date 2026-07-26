import { Inject, Injectable, InjectionToken } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { RenderedEmail } from '../templates/template-catalog.service';

export type EmailTransport = Pick<Transporter, 'sendMail'>;
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
export class EmailSenderService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport
  ) {}

  async send(to: string, replyTo: string | null | undefined, email: RenderedEmail): Promise<void> {
    const message = {
      from: this.config.smtp.from,
      to,
      subject: email.subject,
      html: email.html,
      ...(replyTo?.trim() ? { replyTo } : {}),
    };
    await this.transport.sendMail(message);
  }
}
