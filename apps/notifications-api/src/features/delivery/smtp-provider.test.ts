import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifySmtpError, createSmtpProvider } from './smtp-provider.ts';

function smtpError(responseCode: number, code = 'EENVELOPE'): Error {
  return Object.assign(new Error(`${responseCode} refused`), {
    code,
    responseCode,
    response: `${responseCode} refused by the stand-in`,
  });
}

describe('classifySmtpError', () => {
  it.each([
    [421, 'unavailable'],
    [454, 'unavailable'],
    [530, 'unavailable'],
    [534, 'unavailable'],
    [535, 'unavailable'],
    [450, 'deferred'],
    [451, 'deferred'],
    [452, 'deferred'],
    [550, 'rejected'],
    [552, 'rejected'],
    [554, 'rejected'],
  ])('classifies SMTP reply %i as %s', (code, kind) => {
    expect(classifySmtpError(smtpError(code)).kind).toBe(kind);
  });

  it.each([
    ['ECONNECTION', 'unavailable'],
    ['ETIMEDOUT', 'unavailable'],
    ['ESOCKET', 'unavailable'],
    ['EAUTH', 'unavailable'],
    ['ETLS', 'unavailable'],
    ['EENVELOPE', 'rejected'],
    ['EMESSAGE', 'rejected'],
    ['ESTREAM', 'deferred'],
  ])('classifies a %s error without a reply as %s', (code, kind) => {
    expect(classifySmtpError(Object.assign(new Error('failed'), { code })).kind).toBe(kind);
  });

  it('keeps the reply code, the error class and a short detail', () => {
    const failure = classifySmtpError(
      Object.assign(new Error('ignored'), {
        code: 'EENVELOPE',
        responseCode: 451,
        response: `451 ${'x'.repeat(600)}`,
      })
    );

    expect(failure).toMatchObject({ kind: 'deferred', smtpCode: 451, errorClass: 'EENVELOPE' });
    expect(failure.detail).toHaveLength(500);
  });

  it('counts an unknown failure as deferred, so it is retried and then dead-lettered', () => {
    expect(classifySmtpError(new TypeError('boom'))).toEqual({
      kind: 'deferred',
      smtpCode: undefined,
      errorClass: 'TypeError',
      detail: 'boom',
    });
    expect(classifySmtpError('a string')).toMatchObject({
      kind: 'deferred',
      errorClass: 'UnknownError',
      detail: 'a string',
    });
  });
});

describe('createSmtpProvider', () => {
  let silent: Server;
  let port: number;

  beforeAll(async () => {
    silent = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const address = silent.address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
  });

  afterAll(async () => {
    await new Promise((resolve) => silent.close(resolve));
  });

  it('reports a server that hangs up as unavailable', async () => {
    const provider = createSmtpProvider({ host: '127.0.0.1', port, security: 'none' });

    const error = await provider.verify().catch((caught: unknown) => caught);

    expect(provider.name).toBe('smtp');
    expect(provider.classify(error).kind).toBe('unavailable');
    provider.close();
  });

  it('reports a refused connection as unavailable when sending', async () => {
    const provider = createSmtpProvider({
      host: '127.0.0.1',
      port: 1,
      security: 'tls',
      user: 'user',
      password: 'password',
    });

    const error = await provider
      .send({
        from: { email: 'shop@zigordev.test' },
        to: { email: 'ana@example.com', name: 'Ana' },
        subject: 'Hello',
        text: 'Hello',
      })
      .catch((caught: unknown) => caught);

    expect(provider.classify(error)).toMatchObject({ kind: 'unavailable' });
    provider.close();
  });
});
