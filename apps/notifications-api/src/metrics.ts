import type { Meter } from '@opentelemetry/api';
import { createCounterAtZero } from '@zigordev/otel';
import { type AttemptOutcome, attemptOutcomes } from './db/schema.ts';

export const acceptOutcomes = ['created', 'replayed', 'forbidden'] as const;
export type AcceptOutcome = (typeof acceptOutcomes)[number];

export const deliveryOutcomes = ['sent', 'failed'] as const;
export type DeliveryOutcome = (typeof deliveryOutcomes)[number];

export interface Metrics {
  accepted(producer: string, outcome: AcceptOutcome): void;
  attempted(producer: string, outcome: AttemptOutcome): void;
  delivered(producer: string, outcome: DeliveryOutcome): void;
  deliveryDuration(producer: string, seconds: number): void;
}

function attributeSets(producers: readonly string[], outcomes: readonly string[]) {
  return producers.flatMap((producer) => outcomes.map((outcome) => ({ producer, outcome })));
}

export function createMetrics(meter: Meter, producers: readonly string[]): Metrics {
  const accepts = createCounterAtZero(
    meter,
    'notifications.email.accepts',
    {
      description: 'Email requests read from Kafka: new, read again, or refused for their sender',
      unit: '{email}',
    },
    attributeSets(producers, acceptOutcomes)
  );
  const attempts = createCounterAtZero(
    meter,
    'notifications.email.sends',
    { description: 'Delivery attempts through the provider, by outcome', unit: '{attempt}' },
    attributeSets(producers, attemptOutcomes)
  );
  const deliveries = createCounterAtZero(
    meter,
    'notifications.email.deliveries',
    { description: 'Emails that reached a final state: sent or failed', unit: '{email}' },
    attributeSets(producers, deliveryOutcomes)
  );
  const duration = meter.createHistogram('notifications.email.delivery.duration', {
    description: 'Time from accepting an email to the provider accepting it',
    unit: 's',
    advice: { explicitBucketBoundaries: [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 900, 3600] },
  });
  return {
    accepted: (producer, outcome) => accepts.add(1, { producer, outcome }),
    attempted: (producer, outcome) => attempts.add(1, { producer, outcome }),
    delivered: (producer, outcome) => deliveries.add(1, { producer, outcome }),
    deliveryDuration: (producer, seconds) => duration.record(seconds, { producer }),
  };
}
