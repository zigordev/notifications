import { EventEmitter } from 'node:events';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import { describe, expect, it } from 'vitest';
import { watchQueue } from './work.ts';

describe('watchQueue', () => {
  it('writes queue.failed for an error of the queue, and queue.warning for a warning', () => {
    const boss = new EventEmitter();
    const logs = captureLogs();
    watchQueue(boss, createLogger({ service: 'notifications-api', destination: logs }));

    boss.emit('error', new Error('the pool is gone'));
    boss.emit('warning', { message: 'slow query' });

    expect(logs.lines).toEqual([
      expect.objectContaining({ level: 'error', event: 'queue.failed' }),
      expect.objectContaining({ level: 'warn', event: 'queue.warning', message: 'slow query' }),
    ]);
  });
});
