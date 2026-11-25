import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProducers, readProducers } from './producers.ts';

function file(content: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'notifications-producers-'));
  const path = join(folder, 'producers.json');
  writeFileSync(path, content);
  return path;
}

const shop = { app: 'shop-api', senders: ['shop@zigordev.test', 'help@zigordev.test'] };

describe('readProducers', () => {
  it('reads the committed file, which names the API of the product template', () => {
    const producers = readProducers(fileURLToPath(new URL('../producers.json', import.meta.url)));

    expect(producers.all).toEqual([
      {
        app: 'template-api',
        senders: ['no-reply@zigordev.com'],
        requestTopic: 'notifications.requests.template-api',
        outcomeTopic: 'notifications.outcomes.template-api',
      },
    ]);
  });

  it('gives each producer its request topic and its outcome topic', () => {
    const producers = readProducers(file(JSON.stringify({ producers: [shop] })));

    expect(producers.all).toEqual([
      {
        app: 'shop-api',
        senders: ['shop@zigordev.test', 'help@zigordev.test'],
        requestTopic: 'notifications.requests.shop-api',
        outcomeTopic: 'notifications.outcomes.shop-api',
      },
    ]);
    expect(producers.apps).toEqual(['shop-api']);
    expect(producers.requestTopics).toEqual(['notifications.requests.shop-api']);
  });

  it('says so when the file cannot be read', () => {
    expect(() => readProducers('/nothing/producers.json')).toThrow(
      'The producers file /nothing/producers.json cannot be read'
    );
  });

  it('says so when the file is not JSON', () => {
    const path = file('not json');

    expect(() => readProducers(path)).toThrow(`The producers file ${path} is not JSON`);
  });

  it.each([
    ['an app in capitals', { producers: [{ ...shop, app: 'Shop' }] }, 'producers.0.app'],
    ['an app without a sender', { producers: [{ ...shop, senders: [] }] }, 'producers.0.senders'],
    [
      'a sender that is no address',
      { producers: [{ ...shop, senders: ['shop'] }] },
      'producers.0.senders.0',
    ],
    ['an app named twice', { producers: [shop, shop] }, 'producers: names each app once'],
    ['a field nobody knows', { producers: [shop], keys: [] }, '(file)'],
  ])('refuses %s, and names the field', (_name, content, field) => {
    expect(() => readProducers(file(JSON.stringify(content)))).toThrow(field);
  });
});

describe('a producer', () => {
  const producers = createProducers([shop]);
  const [producer] = producers.all;

  it('is found by its request topic, and only by its own', () => {
    expect(producers.byRequestTopic('notifications.requests.shop-api')).toBe(producer);
    expect(producers.byRequestTopic('notifications.requests.other-api')).toBeUndefined();
  });

  it('sends from its first sender when a request names none', () => {
    expect(producer && producers.senderFor(producer, undefined)).toEqual({
      mailbox: { email: 'shop@zigordev.test' },
      allowed: true,
    });
  });

  it('sends from any of its senders, whatever the case of the address', () => {
    const from = { email: 'Help@ZigorDev.test', name: 'Help' };

    expect(producer && producers.senderFor(producer, from)).toEqual({
      mailbox: from,
      allowed: true,
    });
  });

  it('may not send from an address it was not given', () => {
    expect(producer && producers.senderFor(producer, { email: 'ceo@zigordev.test' })).toEqual({
      mailbox: { email: 'ceo@zigordev.test' },
      allowed: false,
    });
  });
});
