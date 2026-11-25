import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import nodemailer from 'nodemailer';
import type { EmailProvider, Mailbox, SendFailure } from './provider.ts';

const tracer = trace.getTracer('notifications-api');

export type SmtpSecurity = 'starttls' | 'tls' | 'none';

export interface SmtpOptions {
  readonly host: string;
  readonly port: number;
  readonly security: SmtpSecurity;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
}

const unavailableReplyCodes = new Set([421, 454, 530, 534, 535]);
const unavailableErrorCodes = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ETLS',
  'EAUTH',
  'EPROTOCOL',
  'ECONNREFUSED',
  'ECONNRESET',
  'EREQUIRETLS',
]);
const rejectedErrorCodes = new Set(['EENVELOPE', 'EMESSAGE']);
const detailLimit = 500;

function field(error: unknown, name: string): unknown {
  return typeof error === 'object' && error !== null ? Reflect.get(error, name) : undefined;
}

function errorClassOf(error: unknown, code: unknown): string {
  if (typeof code === 'string') {
    return code;
  }
  return error instanceof Error ? error.name : 'UnknownError';
}

function detailOf(error: unknown): string {
  const response = field(error, 'response');
  const text =
    typeof response === 'string' && response !== ''
      ? response
      : error instanceof Error
        ? error.message
        : String(error);
  return text.slice(0, detailLimit);
}

export function classifySmtpError(error: unknown): SendFailure {
  const replyCode = field(error, 'responseCode');
  const smtpCode = typeof replyCode === 'number' ? replyCode : undefined;
  const code = field(error, 'code');
  const errorClass = errorClassOf(error, code);
  const detail = detailOf(error);
  if (smtpCode !== undefined) {
    if (unavailableReplyCodes.has(smtpCode)) {
      return { kind: 'unavailable', smtpCode, errorClass, detail };
    }
    if (smtpCode >= 500) {
      return { kind: 'rejected', smtpCode, errorClass, detail };
    }
    return { kind: 'deferred', smtpCode, errorClass, detail };
  }
  if (typeof code === 'string' && unavailableErrorCodes.has(code)) {
    return { kind: 'unavailable', smtpCode, errorClass, detail };
  }
  if (typeof code === 'string' && rejectedErrorCodes.has(code)) {
    return { kind: 'rejected', smtpCode, errorClass, detail };
  }
  return { kind: 'deferred', smtpCode, errorClass, detail };
}

function address(mailbox: Mailbox): { name: string; address: string } | string {
  return mailbox.name ? { name: mailbox.name, address: mailbox.email } : mailbox.email;
}

export function createSmtpProvider(options: SmtpOptions): EmailProvider {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.security === 'tls',
    requireTLS: options.security === 'starttls',
    ignoreTLS: options.security === 'none',
    ...(options.user === undefined
      ? {}
      : { auth: { user: options.user, pass: options.password ?? '' } }),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  const attributes = { 'server.address': options.host, 'server.port': options.port };
  return {
    name: 'smtp',
    send(email) {
      return tracer.startActiveSpan(
        'smtp.send',
        { kind: SpanKind.CLIENT, attributes },
        async (span) => {
          try {
            const info = await transport.sendMail({
              from: address(email.from),
              to: address(email.to),
              ...(email.replyTo === undefined ? {} : { replyTo: address(email.replyTo) }),
              subject: email.subject,
              ...(email.html ? { html: email.html } : {}),
              ...(email.text ? { text: email.text } : {}),
            });
            const response = String(info.response).slice(0, detailLimit);
            span.setAttribute('smtp.response.code', Number.parseInt(response, 10));
            return { messageId: info.messageId, response };
          } catch (error) {
            const failure = classifySmtpError(error);
            span.setAttribute('error.type', failure.errorClass);
            if (failure.smtpCode !== undefined) {
              span.setAttribute('smtp.response.code', failure.smtpCode);
            }
            span.setStatus({ code: SpanStatusCode.ERROR, message: failure.kind });
            throw error;
          } finally {
            span.end();
          }
        }
      );
    },
    async verify() {
      await transport.verify();
    },
    classify: classifySmtpError,
    close() {
      transport.close();
    },
  };
}
