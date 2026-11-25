import { metrics } from '@opentelemetry/api';
import type { ApiPlugin } from '@zigordev/api';
import { createCounterAtZero } from '@zigordev/otel';
import * as z from 'zod';

export interface HelloOptions {
  readonly service: string;
}

export const hello: ApiPlugin<HelloOptions> = async (app, options) => {
  const greetings = createCounterAtZero(
    metrics.getMeter(options.service),
    'notifications.greetings',
    {
      description: 'Greetings sent',
    }
  );

  app.get(
    '/hello',
    {
      config: { public: true },
      schema: {
        summary: 'Say hello',
        tags: ['hello'],
        operationId: 'getHello',
        response: { 200: z.object({ message: z.string() }) },
      },
    },
    async (request) => {
      greetings.add(1);
      request.log.info({ event: 'greeting.sent' });
      return { message: `Hello from ${options.service}` };
    }
  );
};
