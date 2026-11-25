import { type ConsumerDefinition, defineConsumer } from '@zigordev/events';
import { emailRequested } from '@zigordev/notifications-events';
import { type AcceptDependencies, acceptRequest } from './service.ts';

export const requestsGroup = 'notifications-api.requests';

export interface RequestsOptions extends AcceptDependencies {
  readonly group?: string;
  readonly retryDelays?: readonly number[];
}

export function requestsConsumer(options: RequestsOptions): ConsumerDefinition | undefined {
  const topics = options.producers.requestTopics;
  if (topics.length === 0) {
    return undefined;
  }
  return defineConsumer({
    group: options.group ?? requestsGroup,
    topics,
    events: [emailRequested],
    ...(options.retryDelays === undefined ? {} : { retryDelays: options.retryDelays }),
    handle: async (event, { tx, topic }) => {
      const producer = options.producers.byRequestTopic(topic);
      if (producer === undefined) {
        throw new Error(`No producer sends on the topic ${topic}`);
      }
      await acceptRequest(tx, producer, event, options);
    },
  });
}
