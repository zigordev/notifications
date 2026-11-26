import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { requestTopicOf } from '@zigordev/notifications-events';
import { useKafka } from '@zigordev/test/kafka';
import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Mailpit, startMailpit } from '../test/mailpit.ts';
import { startProduct } from '../test/product.ts';
import { createProducerTopics, producersFile, uniqueApp } from '../test/service.ts';
import { waitFor } from '../test/wait.ts';

interface Attribute {
  readonly key: string;
  readonly value: { readonly stringValue?: string };
}

interface ExportedSpan {
  readonly name: string;
  readonly traceId: string;
  readonly attributes: readonly Attribute[];
}

interface DataPoint {
  readonly asDouble?: number;
  readonly asInt?: string | number;
  readonly attributes?: readonly Attribute[];
}

interface ExportedMetric {
  readonly name: string;
  readonly sum?: { readonly dataPoints: readonly DataPoint[] };
  readonly gauge?: { readonly dataPoints: readonly DataPoint[] };
}

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const folder = fileURLToPath(new URL('..', import.meta.url));
const database = useTestDatabase();
const productDatabase = useTestDatabase();
const kafka = useKafka();
const shop = uniqueApp('shop');
let mailpit: Mailpit;
let receiver: Server;
let bodies: { path: string; body: Record<string, unknown> }[];

beforeAll(async () => {
  [mailpit] = await Promise.all([startMailpit(), createProducerTopics(kafka, [shop])]);
}, 60_000);

afterAll(async () => {
  await mailpit?.stop();
});

beforeEach(async () => {
  bodies = [];
  receiver = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      bodies.push({
        path: request.url ?? '',
        body: JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  await new Promise((resolve) => receiver.close(resolve));
});

async function freePort(): Promise<number> {
  const probe = createTcpServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function settings(): Record<string, string> {
  return {
    OTEL_SERVICE_NAME: 'notifications-api',
    DATABASE_URL: database.url,
    KAFKA_BROKERS: kafka.brokers.join(','),
    KAFKA_USERNAME: kafka.username,
    KAFKA_PASSWORD: kafka.password,
    PRODUCERS_FILE: producersFile([{ app: shop, senders: ['shop@zigordev.test'] }]),
    ...mailpit.env,
  };
}

async function run(env: Record<string, string>, during: (base: string) => Promise<void>) {
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', '@zigordev/otel/register', 'src/main.ts'], {
    cwd: folder,
    env: {
      PORT: String(port),
      HOST: '127.0.0.1',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_METRIC_EXPORT_INTERVAL: '600000',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
  const started = new Promise<boolean>((resolve) => {
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes('"event":"service.started"')) {
        resolve(true);
      }
    });
    void exited.then(() => resolve(false));
  });
  if (await started) {
    try {
      await during(`http://127.0.0.1:${port}`);
    } finally {
      child.kill('SIGTERM');
    }
  }
  return { code: await exited, stdout, stderr } satisfies Run;
}

async function healthy(base: string): Promise<unknown> {
  return waitFor(
    async () => (await fetch(`${base}/health`)).json() as Promise<{ status: string }>,
    (body) => body.status === 'ok'
  );
}

function lines(stdout: string): Record<string, unknown>[] {
  return stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function spans(): ExportedSpan[] {
  return bodies
    .filter((entry) => entry.path === '/v1/traces')
    .flatMap((entry) => entry.body.resourceSpans as { scopeSpans: { spans: ExportedSpan[] }[] }[])
    .flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans));
}

function metrics(): ExportedMetric[] {
  return bodies
    .filter((entry) => entry.path === '/v1/metrics')
    .flatMap(
      (entry) => entry.body.resourceMetrics as { scopeMetrics: { metrics: ExportedMetric[] }[] }[]
    )
    .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics));
}

function count(name: string, outcome: string): number {
  const metric = metrics().find((candidate) => candidate.name === name);
  const point = metric?.sum?.dataPoints.find((candidate) =>
    candidate.attributes?.some(
      (attribute) => attribute.key === 'outcome' && attribute.value.stringValue === outcome
    )
  );
  return Number(point?.asInt ?? point?.asDouble ?? 0);
}

function gauge(name: string): number | undefined {
  const point = metrics()
    .find((candidate) => candidate.name === name)
    ?.gauge?.dataPoints.at(-1);
  return point === undefined ? undefined : Number(point.asInt ?? point.asDouble);
}

describe('the service as a process', () => {
  it('starts, reports every part up with its version, and stops cleanly on a SIGTERM', async () => {
    let health: unknown;
    const outcome = await run({ ...settings(), OTEL_SERVICE_VERSION: '1f3a9c2' }, async (base) => {
      health = await healthy(base);
    });

    expect(outcome.stderr).toBe('');
    expect(outcome.code).toBe(0);
    expect(health).toEqual({
      status: 'ok',
      service: 'notifications-api',
      version: '1f3a9c2',
      components: {
        db: { status: 'up' },
        flags: { status: 'up' },
        provider: { status: 'up' },
        kafka: { status: 'up' },
        topics: { status: 'up' },
      },
    });
  }, 60_000);

  it('writes its life as JSON lines, and sends no trace while it waits for work', async () => {
    const outcome = await run({ ...settings(), OTEL_SERVICE_VERSION: '1f3a9c2' }, async (base) => {
      await healthy(base);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    });

    const written = lines(outcome.stdout);
    for (const line of written) {
      expect(line).toMatchObject({
        service: 'notifications-api',
        release: '1f3a9c2',
        level: 'info',
      });
    }
    expect(written.filter((line) => line.event !== undefined).map((line) => line.event)).toEqual([
      'service.started',
      'service.stopping',
    ]);
    expect(spans()).toEqual([]);
  }, 60_000);

  it('carries the trace of a request from Kafka through the queue and SMTP to its outcome', async () => {
    const product = startProduct({ app: shop, databaseUrl: productDatabase.url, kafka });
    let requestId = '';
    try {
      const outcome = await run(settings(), async (base) => {
        await healthy(base);
        const event = await product.request({
          to: { email: `ana.${randomUUID()}@example.com` },
          subject: `Your order ${randomUUID()}`,
          text: 'Hola',
        });
        requestId = event.id;
        await product.outcomeOf(event.id);
      });
      expect(outcome.code).toBe(0);

      const consumed = spans().find((span) => span.name === `process ${requestTopicOf(shop)}`);
      expect(consumed).toBeDefined();
      const trace = spans()
        .filter((span) => span.traceId === consumed?.traceId)
        .map((span) => span.name);
      expect(trace).toEqual(
        expect.arrayContaining([
          `process ${requestTopicOf(shop)}`,
          'send email-deliveries',
          'process email-deliveries',
          'smtp.send',
          `send notifications.outcomes.${shop}`,
        ])
      );
      const events = lines(outcome.stdout).filter((line) => line.requestId === requestId);
      expect(events.map((line) => [line.event, line.traceId])).toEqual([
        ['email.accepted', consumed?.traceId],
      ]);
      expect(lines(outcome.stdout).find((line) => line.event === 'email.sent')?.traceId).toBe(
        consumed?.traceId
      );
      expect(count('notifications.email.accepts', 'created')).toBe(1);
      expect(count('notifications.email.sends', 'sent')).toBe(1);
      expect(count('notifications.email.deliveries', 'sent')).toBe(1);
    } finally {
      await product.stop();
    }
  }, 60_000);

  it('reports its check of the mail server as 1 while the server answers', async () => {
    let reported: number | undefined;
    const outcome = await run(
      { ...settings(), OTEL_METRIC_EXPORT_INTERVAL: '500' },
      async (base) => {
        await healthy(base);
        reported = await waitFor(
          async () => gauge('notifications.provider.up'),
          (value) => value !== undefined
        );
      }
    );

    expect(outcome.code).toBe(0);
    expect(reported).toBe(1);
  }, 60_000);

  it('reports its check of the mail server as 0 while the server cannot be reached', async () => {
    const closed = await freePort();
    let reported: number | undefined;
    const outcome = await run(
      { ...settings(), SMTP_PORT: String(closed), OTEL_METRIC_EXPORT_INTERVAL: '500' },
      async () => {
        reported = await waitFor(
          async () => gauge('notifications.provider.up'),
          (value) => value !== undefined
        );
      }
    );

    expect(outcome.code).toBe(0);
    expect(reported).toBe(0);
  }, 60_000);

  it('refuses to start without the name of the service, and says so', async () => {
    const outcome = await run({}, async () => undefined);

    expect(outcome.code).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toContain('- OTEL_SERVICE_NAME: is missing');
  }, 30_000);
});
