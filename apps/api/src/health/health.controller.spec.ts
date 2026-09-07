import { vi } from 'vitest';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const respond = () => {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
};

const controllerWith = (body: Awaited<ReturnType<HealthService['check']>>) =>
  new HealthController({ check: vi.fn().mockResolvedValue(body) } as unknown as HealthService);

describe('HealthController', () => {
  it('answers 200 while every dependency is up', async () => {
    const body = {
      status: 'ok' as const,
      service: 'notifications-api',
      components: { db: { status: 'up' as const }, kafka: { status: 'up' as const } },
    };
    const response = respond();

    await controllerWith(body).health(response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(body);
  });

  it('answers 503 when Kafka is down, so the container healthcheck fails rather than the queue silently growing', async () => {
    const body = {
      status: 'error' as const,
      service: 'notifications-api',
      components: { db: { status: 'up' as const }, kafka: { status: 'down' as const } },
    };
    const response = respond();

    await controllerWith(body).health(response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(body);
  });
});
