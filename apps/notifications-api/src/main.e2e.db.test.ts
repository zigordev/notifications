import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { useTestDatabase } from '@zigordev/test/postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface Attribute {
  readonly key: string;
  readonly value: { readonly stringValue?: string };
}

interface ExportedSpan {
  readonly name: string;
  readonly traceId: string;
  readonly attributes: readonly Attribute[];
}

interface ExportedMetric {
  readonly name: string;
  readonly sum?: { readonly dataPoints: readonly { readonly asDouble?: number }[] };
}

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly answers: readonly { readonly status: number; readonly body: unknown }[];
}

const folder = fileURLToPath(new URL('..', import.meta.url));
const database = useTestDatabase();
let receiver: Server;
let bodies: { path: string; body: Record<string, unknown> }[];

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

async function run(env: Record<string, string>, paths: readonly string[]): Promise<Run> {
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', '@zigordev/otel/register', 'src/main.ts'], {
    cwd: folder,
    env: {
      PORT: String(port),
      HOST: '127.0.0.1',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_METRIC_EXPORT_INTERVAL: '600000',
      DATABASE_URL: database.url,
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
  const answers: { status: number; body: unknown }[] = [];
  if (await started) {
    for (const path of paths) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      answers.push({ status: response.status, body: (await response.json()) as unknown });
    }
    child.kill('SIGTERM');
  }
  return { code: await exited, stdout, stderr, answers };
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

describe('the API as a process', () => {
  it('starts, answers with its version, and stops cleanly on a SIGTERM', async () => {
    const outcome = await run(
      { OTEL_SERVICE_NAME: 'notifications-api', OTEL_SERVICE_VERSION: '1f3a9c2' },
      ['/api/v1/hello', '/health']
    );

    expect(outcome.stderr).toBe('');
    expect(outcome.code).toBe(0);
    expect(outcome.answers).toEqual([
      { status: 200, body: { message: 'Hello from notifications-api' } },
      {
        status: 200,
        body: {
          status: 'ok',
          service: 'notifications-api',
          version: '1f3a9c2',
          components: { db: { status: 'up' }, flags: { status: 'up' } },
        },
      },
    ]);
  }, 30_000);

  it('writes its life and its greeting as JSON lines, with the trace of the request', async () => {
    const outcome = await run(
      { OTEL_SERVICE_NAME: 'notifications-api', OTEL_SERVICE_VERSION: '1f3a9c2' },
      ['/api/v1/hello', '/health']
    );

    const written = lines(outcome.stdout);
    for (const line of written) {
      expect(line).toMatchObject({
        service: 'notifications-api',
        release: '1f3a9c2',
        level: 'info',
      });
    }
    expect(written[0]?.message).toMatch(/^Server listening at http:/);
    const events = written.filter((line) => line.event !== undefined);
    expect(events.map((line) => line.event)).toEqual([
      'service.started',
      'greeting.sent',
      'service.stopping',
    ]);
    expect(events[1]?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(events[1]?.traceId).toBe(spans()[0]?.traceId);
  }, 30_000);

  it('sends one span per request, named by its route, and its numbers', async () => {
    await run({ OTEL_SERVICE_NAME: 'notifications-api' }, ['/api/v1/hello', '/health']);

    expect(spans().map((span) => span.name)).toEqual(['GET /api/v1/hello']);
    expect(spans()[0]?.attributes).toContainEqual({
      key: 'http.route',
      value: { stringValue: '/api/v1/hello' },
    });
    const greetings = metrics().find((metric) => metric.name === 'notifications.greetings');
    expect(greetings?.sum?.dataPoints.map((point) => point.asDouble)).toEqual([1]);
    expect(metrics().map((metric) => metric.name)).toContain('http.server.request.duration');
  }, 30_000);

  it('refuses to start without the name of the service, and says so', async () => {
    const outcome = await run({}, []);

    expect(outcome.code).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toContain('- OTEL_SERVICE_NAME: is missing');
  }, 30_000);
});
