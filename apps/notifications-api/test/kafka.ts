import { Admin } from '@platformatic/kafka';
import type { KafkaAccess } from '@zigordev/test/kafka';

export async function createTopics(access: KafkaAccess, topics: readonly string[]): Promise<void> {
  const admin = new Admin({
    clientId: 'notifications-test',
    bootstrapBrokers: [...access.brokers],
    sasl: { mechanism: 'SCRAM-SHA-512', username: access.username, password: access.password },
  });
  try {
    await admin.createTopics({ topics: [...topics], partitions: 1, replicas: 1 });
  } finally {
    await admin.close();
  }
}
