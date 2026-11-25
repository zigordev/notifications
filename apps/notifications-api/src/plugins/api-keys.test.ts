import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { apiKeys, hashKey } from './api-keys.ts';

const key = randomUUID();
const authenticate = apiKeys([
  { name: 'notifications-web', sha256: hashKey(key), scopes: ['notes:read', 'notes:write'] },
]);

function request(authorization?: string): FastifyRequest {
  return { headers: authorization === undefined ? {} : { authorization } } as FastifyRequest;
}

describe('apiKeys', () => {
  it('signs in the caller whose key it knows, with the name and scopes of that key', () => {
    expect(authenticate(request(`Bearer ${key}`))).toEqual({
      id: 'notifications-web',
      scopes: ['notes:read', 'notes:write'],
    });
  });

  it('signs in nobody without a key, with a key it does not know, or with another scheme', () => {
    expect(authenticate(request())).toBeUndefined();
    expect(authenticate(request(`Bearer ${randomUUID()}`))).toBeUndefined();
    expect(authenticate(request(`Basic ${key}`))).toBeUndefined();
  });
});

describe('hashKey', () => {
  it('gives the SHA-256 of a key as 64 hexadecimal characters', () => {
    expect(hashKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
