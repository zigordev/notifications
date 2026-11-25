import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentFile, renderOpenapi } from './openapi.ts';

describe('the committed OpenAPI file', () => {
  it('is the document the code describes. Run pnpm --dir apps/notifications-api run openapi after a change', async () => {
    const committed: unknown = JSON.parse(readFileSync(documentFile, 'utf8'));

    expect(committed).toEqual(JSON.parse(await renderOpenapi()));
  });

  it('describes no business endpoint, because requests and outcomes travel over Kafka', async () => {
    const document = JSON.parse(await renderOpenapi()) as { paths?: Record<string, unknown> };

    expect(document.paths ?? {}).toEqual({});
  });
});
