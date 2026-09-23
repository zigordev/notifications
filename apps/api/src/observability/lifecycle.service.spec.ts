import { afterEach, describe, expect, it, vi } from 'vitest';
import { LifecycleService } from './lifecycle.service';

describe('LifecycleService', () => {
  afterEach(() => vi.restoreAllMocks());

  const logged = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

  it('logs the stop with the signal Nest was given', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    new LifecycleService().onApplicationShutdown('SIGTERM');
    new LifecycleService().onApplicationShutdown();

    expect(logged(stdout)).toEqual([
      expect.objectContaining({ event: 'service.stopping', signal: 'SIGTERM' }),
      expect.objectContaining({ event: 'service.stopping', signal: 'shutdown' }),
    ]);
  });
});
