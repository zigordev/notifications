export interface Mailbox {
  readonly email: string;
  readonly name?: string | null | undefined;
}

export interface OutgoingEmail {
  readonly from: Mailbox;
  readonly to: Mailbox;
  readonly replyTo?: Mailbox | undefined;
  readonly subject: string;
  readonly html?: string | null | undefined;
  readonly text?: string | null | undefined;
}

export interface SentEmail {
  readonly messageId: string;
  readonly response: string;
}

export type SendFailureKind = 'deferred' | 'rejected' | 'unavailable';

export interface SendFailure {
  readonly kind: SendFailureKind;
  readonly smtpCode: number | undefined;
  readonly errorClass: string;
  readonly detail: string;
}

export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<SentEmail>;
  verify(): Promise<void>;
  classify(error: unknown): SendFailure;
  close(): void;
}
