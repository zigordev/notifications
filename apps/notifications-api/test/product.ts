import {
  addToOutbox,
  createEnvelope,
  type Database,
  defineConsumer,
  eventsOutbox,
  startEvents,
} from '@zigordev/events';
import {
  type EmailOutcomeEvent,
  type EmailRequest,
  type EmailRequestedEvent,
  emailRequested,
  outcomeEvents,
  outcomeTopicOf,
  requestTopicOf,
} from '@zigordev/notifications-events';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import type { KafkaAccess } from '@zigordev/test/kafka';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { waitFor } from './wait.ts';

export interface Product {
  readonly app: string;
  request(data: EmailRequest): Promise<EmailRequestedEvent>;
  send(topic: string, value: unknown): Promise<void>;
  outcomes(): readonly EmailOutcomeEvent[];
  outcomeOf(requestId: string, timeoutMs?: number): Promise<EmailOutcomeEvent>;
  stop(): Promise<void>;
}

export interface ProductOptions {
  readonly app: string;
  readonly databaseUrl: string;
  readonly kafka: KafkaAccess;
}

export function startProduct(options: ProductOptions): Product {
  const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 3 });
  const db: Database = drizzle({ client: pool, casing: 'snake_case' });
  const received: EmailOutcomeEvent[] = [];
  const events = startEvents({
    connection: {
      clientId: options.app,
      brokers: options.kafka.brokers,
      username: options.kafka.username,
      password: options.kafka.password,
    },
    db,
    logger: createLogger({ service: options.app, destination: captureLogs() }),
    relay: { interval: 100 },
    consumers: [
      defineConsumer({
        group: `${options.app}.outcomes`,
        topics: [outcomeTopicOf(options.app)],
        events: outcomeEvents,
        handle: async (event) => {
          received.push(event);
        },
      }),
    ],
  });

  return {
    app: options.app,
    request: async (data) => {
      const event = await addToOutbox(db, {
        topic: requestTopicOf(options.app),
        event: emailRequested,
        data,
      });
      await events.flush();
      return event;
    },
    send: async (topic, value) => {
      await db.insert(eventsOutbox).values({ topic, key: 'test', value, headers: {} });
      await events.flush();
    },
    outcomes: () => received,
    outcomeOf: (requestId, timeoutMs = 20_000) =>
      waitFor(
        async () => received.find((event) => event.data.requestId === requestId),
        (event) => event !== undefined,
        timeoutMs
      ) as Promise<EmailOutcomeEvent>,
    stop: async () => {
      await events.stop();
      await pool.end();
    },
  };
}

export function requestEnvelope(data: EmailRequest): EmailRequestedEvent {
  return createEnvelope(emailRequested, data);
}
