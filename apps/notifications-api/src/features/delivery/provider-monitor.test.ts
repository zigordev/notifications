import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmailProvider, SentEmail } from './provider.ts';
import { ProviderMonitor } from './provider-monitor.ts';
import { classifySmtpError } from './smtp-provider.ts';

function smtpError(responseCode: number, code: string): Error {
  return Object.assign(new Error(`${responseCode} refused`), {
    code,
    responseCode,
    response: `${responseCode} refused by the stand-in`,
  });
}

class StandIn implements EmailProvider {
  readonly name = 'stand-in';
  verifyError: unknown;

  async send(): Promise<SentEmail> {
    return { messageId: '<id@stand-in.test>', response: '250 OK' };
  }

  async verify(): Promise<void> {
    if (this.verifyError !== undefined) {
      throw this.verifyError;
    }
  }

  classify(error: unknown) {
    return classifySmtpError(error);
  }

  close(): void {}
}

function setup() {
  const provider = new StandIn();
  const logs = captureLogs();
  const logger = createLogger({ service: 'notifications-api', destination: logs });
  const monitor = new ProviderMonitor({ provider, logger, intervalMs: 1000 });
  const changes: string[] = [];
  monitor.onChange((status) => changes.push(status));
  return { provider, logs, monitor, changes };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ProviderMonitor', () => {
  it('starts unknown and becomes up after a good check, without a log line', async () => {
    const { monitor, logs, changes } = setup();

    expect(monitor.status).toBe('unknown');
    await monitor.check();

    expect(monitor.status).toBe('up');
    expect(changes).toEqual(['up']);
    expect(logs.lines).toEqual([]);
  });

  it('writes provider.unavailable once when the provider goes down', async () => {
    const { monitor, provider, logs, changes } = setup();
    provider.verifyError = smtpError(535, 'EAUTH');

    await monitor.check();
    await monitor.check();

    expect(monitor.status).toBe('down');
    expect(changes).toEqual(['down']);
    expect(logs.lines).toEqual([
      expect.objectContaining({
        level: 'error',
        event: 'provider.unavailable',
        provider: 'stand-in',
        errorClass: 'EAUTH',
        smtpCode: 535,
      }),
    ]);
  });

  it('writes provider.recovered when a provider that was down answers again', async () => {
    const { monitor, provider, logs, changes } = setup();
    provider.verifyError = smtpError(421, 'ECONNECTION');
    await monitor.check();

    provider.verifyError = undefined;
    await monitor.check();

    expect(monitor.status).toBe('up');
    expect(changes).toEqual(['down', 'up']);
    expect(logs.events()).toEqual(['provider.unavailable', 'provider.recovered']);
  });

  it('goes down at once when a send reports the provider unavailable', async () => {
    const { monitor, provider, changes } = setup();
    await monitor.check();

    monitor.reportUnavailable(provider.classify(smtpError(535, 'EAUTH')));

    expect(monitor.status).toBe('down');
    expect(changes).toEqual(['up', 'down']);
  });

  it('runs one check at a time', async () => {
    const { monitor, provider } = setup();
    const verify = vi.spyOn(provider, 'verify');

    await Promise.all([monitor.check(), monitor.check()]);

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('checks on an interval until stopped, and lets a listener go', async () => {
    vi.useFakeTimers();
    const { monitor, provider } = setup();
    const verify = vi.spyOn(provider, 'verify');
    const listener = vi.fn();
    const unsubscribe = monitor.onChange(listener);

    await monitor.start();
    await vi.advanceTimersByTimeAsync(2500);
    unsubscribe();
    provider.verifyError = smtpError(421, 'ECONNECTION');
    await vi.advanceTimersByTimeAsync(1000);
    monitor.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(verify).toHaveBeenCalledTimes(4);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(monitor.status).toBe('down');
  });
});
