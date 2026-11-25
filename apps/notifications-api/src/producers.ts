import { readFileSync } from 'node:fs';
import { type Mailbox, outcomeTopicOf, requestTopicOf } from '@zigordev/notifications-events';
import * as z from 'zod';

const appName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const producerSchema = z.strictObject({
  app: z.string().regex(appName, 'is lower case words joined by dashes, such as playground-api'),
  senders: z.array(z.email().max(254)).min(1),
});

const producersFileSchema = z.strictObject({
  producers: z
    .array(producerSchema)
    .refine(
      (producers) => new Set(producers.map((producer) => producer.app)).size === producers.length,
      {
        message: 'names each app once',
      }
    ),
});

export type ProducerEntry = z.output<typeof producerSchema>;

export interface Producer {
  readonly app: string;
  readonly senders: readonly string[];
  readonly requestTopic: string;
  readonly outcomeTopic: string;
}

export interface Sender {
  readonly mailbox: Mailbox;
  readonly allowed: boolean;
}

export interface Producers {
  readonly all: readonly Producer[];
  readonly apps: readonly string[];
  readonly requestTopics: readonly string[];
  byRequestTopic(topic: string): Producer | undefined;
  senderFor(producer: Producer, from: Mailbox | undefined): Sender;
}

export function createProducers(entries: readonly ProducerEntry[]): Producers {
  const all = entries.map(
    (entry): Producer => ({
      app: entry.app,
      senders: entry.senders,
      requestTopic: requestTopicOf(entry.app),
      outcomeTopic: outcomeTopicOf(entry.app),
    })
  );
  const byTopic = new Map(all.map((producer) => [producer.requestTopic, producer]));
  return {
    all,
    apps: all.map((producer) => producer.app),
    requestTopics: all.map((producer) => producer.requestTopic),
    byRequestTopic: (topic) => byTopic.get(topic),
    senderFor(producer, from) {
      if (from === undefined) {
        return { mailbox: { email: producer.senders[0] ?? '' }, allowed: true };
      }
      const wanted = from.email.toLowerCase();
      return {
        mailbox: from,
        allowed: producer.senders.some((sender) => sender.toLowerCase() === wanted),
      };
    },
  };
}

export function readProducers(file: string): Producers {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`The producers file ${file} cannot be read`, { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`The producers file ${file} is not JSON`, { cause: error });
  }
  const result = producersFileSchema.safeParse(parsed);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '(file)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`The producers file ${file} is invalid: ${problems}`);
  }
  return createProducers(result.data.producers);
}
