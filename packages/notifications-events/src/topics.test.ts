import { describe, expect, it } from 'vitest';
import { appOfRequestTopic, outcomeTopicOf, requestTopicOf } from './topics.ts';

describe('the topics of an app', () => {
  it('start with the name of the service, then say what they hold, then name the app', () => {
    expect(requestTopicOf('playground-api')).toBe('notifications.requests.playground-api');
    expect(outcomeTopicOf('playground-api')).toBe('notifications.outcomes.playground-api');
  });

  it.each(['Playground', 'playground api', 'playground.api', '-playground', ''])(
    'refuse the app name %j',
    (app) => {
      expect(() => requestTopicOf(app)).toThrow(/lower case words joined by dashes/);
      expect(() => outcomeTopicOf(app)).toThrow(/lower case words joined by dashes/);
    }
  );

  it('give the app back from a request topic, and nothing from any other topic', () => {
    expect(appOfRequestTopic('notifications.requests.playground-api')).toBe('playground-api');
    expect(appOfRequestTopic('notifications.outcomes.playground-api')).toBeUndefined();
    expect(appOfRequestTopic('notifications.requests.playground-api.dead-letter')).toBeUndefined();
  });
});
