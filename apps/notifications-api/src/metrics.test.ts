import type {
  Meter,
  MetricOptions,
  ObservableCallback,
  ObservableGauge,
  ObservableResult,
} from '@opentelemetry/api';
import type { ComponentStatus } from '@zigordev/otel';
import { describe, expect, it } from 'vitest';
import { observeProvider } from './metrics.ts';

function standInMeter() {
  const callbacks = new Set<ObservableCallback>();
  const gauges: { name: string; options: MetricOptions | undefined }[] = [];
  const meter = {
    createObservableGauge(name: string, options?: MetricOptions): ObservableGauge {
      gauges.push({ name, options });
      return {
        addCallback: (callback: ObservableCallback) => {
          callbacks.add(callback);
        },
        removeCallback: (callback: ObservableCallback) => {
          callbacks.delete(callback);
        },
      };
    },
  } as unknown as Meter;
  const read = (): number[] => {
    const values: number[] = [];
    const result: ObservableResult = {
      observe: (value: number) => {
        values.push(value);
      },
    };
    for (const callback of callbacks) {
      void callback(result);
    }
    return values;
  };
  return { meter, gauges, callbacks, read };
}

describe('the number of the mail server check', () => {
  it('is one gauge, named for the platform alert that reads it, with no unit', () => {
    const { meter, gauges } = standInMeter();
    observeProvider(meter, { status: 'up' });

    expect(gauges).toEqual([
      {
        name: 'notifications.provider.up',
        options: {
          description:
            'Whether the last check of the mail server passed: 1 when it did, 0 when it failed',
        },
      },
    ]);
  });

  it('reads 1 while the last check passed and 0 while it failed', () => {
    const { meter, read } = standInMeter();
    const monitor: { status: ComponentStatus } = { status: 'up' };
    observeProvider(meter, monitor);

    expect(read()).toEqual([1]);
    monitor.status = 'down';
    expect(read()).toEqual([0]);
    monitor.status = 'up';
    expect(read()).toEqual([1]);
  });

  it('reports nothing before the first check has an answer', () => {
    const { meter, read } = standInMeter();
    observeProvider(meter, { status: 'unknown' });

    expect(read()).toEqual([]);
  });

  it('stops reporting once the work stops', () => {
    const { meter, callbacks, read } = standInMeter();
    const stop = observeProvider(meter, { status: 'down' });

    stop();

    expect(callbacks.size).toBe(0);
    expect(read()).toEqual([]);
  });
});
