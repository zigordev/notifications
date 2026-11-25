import type { PgBoss, SendOptions } from 'pg-boss';

export const deliveryQueue = 'email-deliveries';
export const deadLetterQueue = 'email-dead-letters';

export const maxDeliveryAttempts = 5;
export const retryLimitBackstop = 20;
export const sendTimeoutSeconds = 120;

export interface DeliveryJob {
  readonly emailId: string;
}

export interface RetryPolicy {
  readonly retryDelaySeconds: number;
  readonly retryDelayMaxSeconds: number;
}

export function deliverySendOptions(policy: RetryPolicy): SendOptions {
  return {
    retryLimit: retryLimitBackstop,
    retryDelay: policy.retryDelaySeconds,
    retryBackoff: true,
    retryDelayMax: policy.retryDelayMaxSeconds,
    expireInSeconds: sendTimeoutSeconds,
  };
}

export async function createQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(deadLetterQueue, { retryLimit: 10, retryDelay: 5, retryBackoff: true });
  await boss.createQueue(deliveryQueue, { deadLetter: deadLetterQueue });
}
