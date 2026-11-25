import { createHash, timingSafeEqual } from 'node:crypto';
import { type Authenticate, bearerToken } from '@zigordev/api';
import * as z from 'zod';

export const scopes = ['notes:read', 'notes:write'] as const;

export const apiKeysSchema = z.array(
  z.strictObject({
    name: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    scopes: z.array(z.enum(scopes)),
  })
);

export type ApiKey = z.output<typeof apiKeysSchema>[number];

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function apiKeys(keys: readonly ApiKey[]): Authenticate {
  const known = keys.map((key) => ({ ...key, digest: Buffer.from(key.sha256, 'hex') }));
  return (request) => {
    const token = bearerToken(request);
    if (token === undefined) {
      return undefined;
    }
    const digest = Buffer.from(hashKey(token), 'hex');
    const found = known.find((key) => timingSafeEqual(key.digest, digest));
    return found === undefined ? undefined : { id: found.name, scopes: found.scopes };
  };
}
