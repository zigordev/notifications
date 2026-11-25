import { writeFileSync } from 'node:fs';
import * as z from 'zod';
import { emailRequested, outcomeEvents } from '../src/events.ts';
import { outcomeTopicPrefix, requestTopicPrefix } from '../src/topics.ts';

export const contractFile = new URL('../events.json', import.meta.url);

export function renderContract(): string {
  const contract = {
    topics: {
      requests: `${requestTopicPrefix}<app>`,
      outcomes: `${outcomeTopicPrefix}<app>`,
    },
    events: [emailRequested, ...outcomeEvents].map((event) => ({
      type: event.type,
      version: event.version,
      schema: z.toJSONSchema(event.schema, { io: 'input' }),
    })),
  };
  return `${JSON.stringify(contract, null, 2)}\n`;
}

if (import.meta.main) {
  writeFileSync(contractFile, renderContract());
}
