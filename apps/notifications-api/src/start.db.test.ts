import { EventEmitter } from 'node:events';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { createLogger, type LoggerOptions } from '@zigordev/otel';
import { useKafka } from '@zigordev/test/kafka';
import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Mailpit, startMailpit } from '../test/mailpit.ts';
import { type Server, type Signal, start, stopOnSignals } from './start.ts';

const otel = vi.hoisted(() => ({
  createLogger: undefined as undefined | typeof import('@zigordev/otel').createLogger,
}));

vi.mock('@zigordev/otel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zigordev/otel')>();
  otel.createLogger = actual.createLogger;
  return { ...actual, createLogger: vi.fn(actual.createLogger) };
});

const database = useTestDatabase();
const kafka = useKafka();
let mailpit: Mailpit;
let lines: string[];
let running: Server | undefined;

beforeAll(async () => {
  mailpit = await startMailpit();
}, 60_000);

afterAll(async () => {
  await mailpit?.stop();
});

function dependencies(): Record<string, string> {
  return {
    DATABASE_URL: database.url,
    KAFKA_BROKERS: kafka.brokers.join(','),
    KAFKA_USERNAME: kafka.username,
    KAFKA_PASSWORD: kafka.password,
    ...mailpit.env,
  };
}

async function freePort(): Promise<number> {
  const probe = createTcpServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startOne(env: Record<string, string> = {}): Promise<Server> {
  lines = [];
  const logger = createLogger({
    service: 'notifications-api',
    destination: { write: (line: string) => lines.push(line) },
  });
  running = await start({
    env: {
      OTEL_SERVICE_NAME: 'notifications-api',
      ...dependencies(),
      PORT: String(await freePort()),
      HOST: '127.0.0.1',
      ...env,
    },
    logger,
  });
  return running;
}

function records(): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(async () => {
  await running?.app.close();
  running = undefined;
  vi.restoreAllMocks();
});

describe('start', () => {
  it('listens on the address it is given, and answers there', async () => {
    const server = await startOne();
    const base = `http://127.0.0.1:${server.config.PORT}`;

    const docs = await fetch(`${base}/api/v1/openapi.json`);
    const health = await fetch(`${base}/health`);

    expect(await docs.json()).toMatchObject({ info: { title: 'Notifications API' } });
    expect(health.status).toBe(200);
  });

  it('writes service.started with its port once it listens', async () => {
    const server = await startOne();

    expect(records()).toContainEqual(
      expect.objectContaining({ event: 'service.started', port: server.config.PORT })
    );
  });

  it('refuses to start without the name of the service, and says which setting is missing', async () => {
    await expect(start({ env: { PORT: '3000' } })).rejects.toThrow(
      '- OTEL_SERVICE_NAME: is missing'
    );
  });

  it('makes its logger from the settings when it is given none', async () => {
    lines = [];
    vi.mocked(createLogger).mockImplementationOnce((options: LoggerOptions) =>
      (otel.createLogger as typeof createLogger)({
        ...options,
        destination: { write: (line: string) => lines.push(line) },
      })
    );
    running = await start({
      env: {
        OTEL_SERVICE_NAME: 'notifications-api',
        ...dependencies(),
        OTEL_SERVICE_VERSION: '1f3a9c2',
        LOG_LEVEL: 'debug',
        PORT: String(await freePort()),
        HOST: '127.0.0.1',
      },
    });

    expect(createLogger).toHaveBeenCalledWith({
      service: 'notifications-api',
      release: '1f3a9c2',
      level: 'debug',
    });
    expect(records()).toContainEqual(
      expect.objectContaining({ event: 'service.started', release: '1f3a9c2' })
    );
  });
});

describe('stop', () => {
  it('writes service.stopping with the signal, closes the server, and ends with code 0', async () => {
    const server = await startOne();
    const base = `http://127.0.0.1:${server.config.PORT}`;

    const code = await server.stop('SIGTERM');

    expect(code).toBe(0);
    expect(records()).toContainEqual(
      expect.objectContaining({ event: 'service.stopping', signal: 'SIGTERM' })
    );
    await expect(fetch(`${base}/health`)).rejects.toThrow();
  });

  it('ends with code 1, and says why, when the server cannot close', async () => {
    const server = await startOne();
    vi.spyOn(server.app, 'close').mockRejectedValueOnce(new Error('still busy'));

    const code = await server.stop('SIGINT');

    expect(code).toBe(1);
    expect(records()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'service.stop_failed',
        error: expect.objectContaining({ message: 'still busy' }),
      })
    );
  });

  it('stops watching for crashes, so a second start adds no second watcher', async () => {
    const before = process.listenerCount('uncaughtExceptionMonitor');
    const server = await startOne();
    const during = process.listenerCount('uncaughtExceptionMonitor');

    await server.stop('SIGTERM');

    expect(during).toBe(before + 1);
    expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(before);
  });
});

describe('stopOnSignals', () => {
  function fakeServer(code: number): Server & { readonly stopped: Signal[] } {
    const stopped: Signal[] = [];
    return {
      app: {} as Server['app'],
      config: {} as Server['config'],
      stopped,
      stop: async (signal) => {
        stopped.push(signal);
        return code;
      },
    };
  }

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'stops the server on %s, and exits with its code',
    async (signal) => {
      const signals = new EventEmitter();
      const server = fakeServer(0);
      const exit = vi.fn();

      stopOnSignals(server, signals, exit);
      signals.emit(signal);
      await vi.waitFor(() => expect(exit).toHaveBeenCalled());

      expect(server.stopped).toEqual([signal]);
      expect(exit).toHaveBeenCalledWith(0);
    }
  );

  it('passes on the code of a stop that failed', async () => {
    const signals = new EventEmitter();
    const exit = vi.fn();

    stopOnSignals(fakeServer(1), signals, exit);
    signals.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('listens for each signal once', () => {
    const signals = new EventEmitter();

    stopOnSignals(fakeServer(0), signals, vi.fn());

    expect(signals.listenerCount('SIGTERM')).toBe(1);
    expect(signals.listenerCount('SIGINT')).toBe(1);
    signals.emit('SIGTERM');
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  });
});
