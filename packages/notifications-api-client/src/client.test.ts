import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { render } from 'notifications-client-generator';
import { describe, expect, it } from 'vitest';
import { createNotificationsApiClient } from './index.ts';

const document = new URL('../../../apps/notifications-api/openapi.json', import.meta.url);
const schema = new URL('./generated/schema.ts', import.meta.url);

describe('the generated types', () => {
  it('are what the committed OpenAPI file gives. Run pnpm run generate after a change', async () => {
    expect(readFileSync(schema, 'utf8')).toBe(await render(document));
  });
});

describe('openapi-typescript', () => {
  it('still needs TypeScript 5. When this fails, record 0036 says how its exception goes', () => {
    const generator = createRequire(import.meta.resolve('notifications-client-generator'));
    const manifest = generator('openapi-typescript/package.json') as {
      readonly version: string;
      readonly peerDependencies: { readonly typescript: string };
    };
    const majors = [...manifest.peerDependencies.typescript.matchAll(/(\d+)(?=\.|\s|$|\b)/g)].map(
      (match) => Number(match[1])
    );

    expect(majors.every((major) => major < 7)).toBe(true);
  });
});

describe('createNotificationsApiClient', () => {
  it('sends the key as a bearer token, to the address it is given', async () => {
    const seen: Request[] = [];
    const client = createNotificationsApiClient({
      baseUrl: 'http://api.test',
      key: 'a-key',
      fetch: async (request) => {
        seen.push(request as Request);
        return Response.json({ message: 'Hello from notifications-api' });
      },
    });

    const { data } = await client.GET('/api/v1/hello');

    expect(data).toEqual({ message: 'Hello from notifications-api' });
    expect(seen[0]?.url).toBe('http://api.test/api/v1/hello');
    expect(seen[0]?.headers.get('authorization')).toBe('Bearer a-key');
  });

  it('sends no credentials when it has no key', async () => {
    const seen: Request[] = [];
    const client = createNotificationsApiClient({
      baseUrl: 'http://api.test',
      fetch: async (request) => {
        seen.push(request as Request);
        return Response.json({ message: 'hello' });
      },
    });

    await client.GET('/api/v1/hello');

    expect(seen[0]?.headers.has('authorization')).toBe(false);
  });
});
