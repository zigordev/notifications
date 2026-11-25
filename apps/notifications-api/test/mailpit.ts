import { readFileSync } from 'node:fs';
import { GenericContainer, Wait } from 'testcontainers';

function stackImage(): string {
  const compose = readFileSync(
    new URL('../../../node_modules/@zigordev/stack/compose.local.yaml', import.meta.url),
    'utf8'
  );
  const image = /image:\s*(axllent\/mailpit:\S+@sha256:[0-9a-f]{64})/.exec(compose)?.[1];
  if (image === undefined) {
    throw new Error('The local bundle of @zigordev/stack names no pinned Mailpit image');
  }
  return image;
}

export const mailpitImage = stackImage();

export interface MailpitAddress {
  readonly Name: string;
  readonly Address: string;
}

export interface MailpitSummary {
  readonly ID: string;
  readonly Subject: string;
  readonly From: MailpitAddress;
  readonly To: MailpitAddress[];
  readonly ReplyTo: MailpitAddress[];
}

export interface MailpitMessage extends MailpitSummary {
  readonly HTML: string;
  readonly Text: string;
}

type Trigger = { readonly ErrorCode: number; readonly Probability: number };
export type ChaosTriggers = Partial<Record<'Sender' | 'Recipient' | 'Authentication', Trigger>>;

export interface Mailpit {
  readonly env: Record<string, string>;
  messages(): Promise<MailpitSummary[]>;
  find(subject: string): Promise<MailpitSummary[]>;
  message(id: string): Promise<MailpitMessage>;
  chaos(triggers: ChaosTriggers): Promise<void>;
  calm(): Promise<void>;
  stop(): Promise<void>;
}

const off = { ErrorCode: 451, Probability: 0 };

export async function startMailpit(): Promise<Mailpit> {
  const container = await new GenericContainer(mailpitImage)
    .withEnvironment({
      MP_SMTP_AUTH_ACCEPT_ANY: 'true',
      MP_SMTP_AUTH_ALLOW_INSECURE: 'true',
      MP_ENABLE_CHAOS: 'true',
    })
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp('/readyz', 8025))
    .start();
  const host = container.getHost();
  const api = `http://${host}:${container.getMappedPort(8025)}/api/v1`;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${api}${path}`, init);
    if (!response.ok) {
      throw new Error(`Mailpit ${path} answered ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function messages(): Promise<MailpitSummary[]> {
    return (await call<{ messages: MailpitSummary[] }>('/messages?limit=500')).messages;
  }

  async function chaos(triggers: ChaosTriggers): Promise<void> {
    await call('/chaos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(triggers),
    });
  }

  return {
    env: {
      SMTP_HOST: host,
      SMTP_PORT: String(container.getMappedPort(1025)),
      SMTP_SECURITY: 'none',
      SMTP_USER: 'notifications',
      SMTP_PASSWORD: 'any-password',
    },
    messages,
    find: async (subject) => (await messages()).filter((message) => message.Subject === subject),
    message: (id) => call<MailpitMessage>(`/message/${id}`),
    chaos,
    calm: () => chaos({ Sender: off, Recipient: off, Authentication: { ...off, ErrorCode: 535 } }),
    stop: async () => {
      await container.stop();
    },
  };
}
