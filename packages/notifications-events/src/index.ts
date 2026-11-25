export type {
  EmailOutcomeEvent,
  EmailRequest,
  EmailRequestedEvent,
  FailureReason,
  Mailbox,
} from './events.ts';
export {
  emailFailed,
  emailRequested,
  emailRequestSchema,
  emailSent,
  failureReasons,
  mailboxSchema,
  maxRequestBytes,
  maxTags,
  outcomeEvents,
} from './events.ts';
export {
  appOfRequestTopic,
  outcomeTopicOf,
  outcomeTopicPrefix,
  requestTopicOf,
  requestTopicPrefix,
} from './topics.ts';
