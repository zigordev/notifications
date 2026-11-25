const appName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const requestTopicPrefix = 'notifications.requests.';
export const outcomeTopicPrefix = 'notifications.outcomes.';

function checked(app: string): string {
  if (!appName.test(app)) {
    throw new Error(
      `An app is named in lower case words joined by dashes, such as playground-api, not ${app}`
    );
  }
  return app;
}

export function requestTopicOf(app: string): string {
  return `${requestTopicPrefix}${checked(app)}`;
}

export function outcomeTopicOf(app: string): string {
  return `${outcomeTopicPrefix}${checked(app)}`;
}

export function appOfRequestTopic(topic: string): string | undefined {
  if (!topic.startsWith(requestTopicPrefix)) {
    return undefined;
  }
  const app = topic.slice(requestTopicPrefix.length);
  return appName.test(app) ? app : undefined;
}
