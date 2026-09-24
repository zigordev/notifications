import { ROOT_CONTEXT, SpanKind } from '@opentelemetry/api';
import { ATTR_HTTP_ROUTE, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FetchSpanNameProcessor,
  isRedispatchPass,
  isRequestSpan,
  normaliseFetchSpan,
  RedispatchedRequestSpanFilter,
  REDISPATCH_HOLD_MS,
  requestSpanKey,
} from './next-spans';

import type { Attributes, HrTime } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';

const TOLGEE_EXPORT =
  'http://tolgee:8080/v2/projects/5/export?format=JSON&languages=en&structureDelimiter=';

const startedSpan = (name: string, attributes: Attributes = {}) => {
  const span = {
    name,
    attributes,
    updateName(next: string) {
      span.name = next;
      return span;
    },
    setAttribute(key: string, value: unknown) {
      span.attributes[key] = value as Attributes[string];
      return span;
    },
  };
  return span as unknown as Span & { name: string; attributes: Attributes };
};

const at = (moment: number | HrTime): HrTime =>
  Array.isArray(moment) ? moment : [Math.floor(moment / 1000), (moment % 1000) * 1e6];

const endedSpan = (
  kind: SpanKind,
  attributes: Attributes,
  startedAt: number | HrTime = 0,
  endedAt: number | HrTime = startedAt
): ReadableSpan =>
  ({ kind, attributes, startTime: at(startedAt), endTime: at(endedAt) }) as unknown as ReadableSpan;

const nextRequestSpan = (route?: string, target = '/', startedAt = 0, endedAt = startedAt) =>
  endedSpan(
    SpanKind.SERVER,
    {
      'next.span_type': 'BaseServer.handleRequest',
      'http.method': 'GET',
      'http.target': target,
      ...(route === undefined ? {} : { [ATTR_HTTP_ROUTE]: route }),
    },
    startedAt,
    endedAt
  );

const redispatchPass = (target = '/', startedAt = 0, endedAt = startedAt) =>
  endedSpan(
    SpanKind.SERVER,
    {
      'next.span_type': 'BaseServer.handleRequest',
      'http.method': 'GET',
      'http.target': target,
      'next.bubble': true,
    },
    startedAt,
    endedAt
  );

const recordingDelegate = () => ({
  onStart: vi.fn(),
  onEnd: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
  forceFlush: vi.fn().mockResolvedValue(undefined),
});

const filterOver = (delegate: ReturnType<typeof recordingDelegate>, limit?: number) =>
  new RedispatchedRequestSpanFilter(
    delegate as unknown as SpanProcessor,
    REDISPATCH_HOLD_MS,
    limit
  );

describe('fetch span names', () => {
  it('keeps the upstream and drops the query string that made every call a new series', () => {
    expect(normaliseFetchSpan(`fetch GET ${TOLGEE_EXPORT}`)).toEqual({
      name: 'fetch GET tolgee:8080',
      url: TOLGEE_EXPORT,
    });
  });

  it('names a call to a public API by its host', () => {
    expect(
      normaliseFetchSpan('fetch POST https://api.anthropic.com/v1/messages?beta=true')
    ).toEqual({
      name: 'fetch POST api.anthropic.com',
      url: 'https://api.anthropic.com/v1/messages?beta=true',
    });
  });

  it('normalises the method, so one upstream is one series', () => {
    expect(normaliseFetchSpan('fetch post http://tolgee:8080/v2/projects')?.name).toBe(
      'fetch POST tolgee:8080'
    );
  });

  it('strips the query from a target that is not an absolute URL', () => {
    expect(normaliseFetchSpan('fetch GET /api/ask?question=who')?.name).toBe('fetch GET /api/ask');
  });

  it('leaves every other span name alone', () => {
    for (const name of [
      'GET /',
      'RSC GET /stats',
      'render route (app) /',
      'fetch',
      'fetch GET http://tolgee:8080/a http://tolgee:8080/b',
      'i18n.load_messages',
    ]) {
      expect(normaliseFetchSpan(name), name).toBeUndefined();
    }
  });
});

describe('fetch span name processor', () => {
  it('renames the span and keeps the whole URL as an attribute', () => {
    const span = startedSpan(`fetch GET ${TOLGEE_EXPORT}`, { 'http.url': TOLGEE_EXPORT });

    new FetchSpanNameProcessor().onStart(span, ROOT_CONTEXT);

    expect(span.name).toBe('fetch GET tolgee:8080');
    expect(span.attributes[ATTR_URL_FULL]).toBe(TOLGEE_EXPORT);
  });

  it('leaves a URL the instrumentation already recorded as it found it', () => {
    const span = startedSpan('fetch GET http://tolgee:8080/v2/projects?page=2', {
      [ATTR_URL_FULL]: 'http://tolgee:8080/v2/projects?page=1',
    });

    new FetchSpanNameProcessor().onStart(span, ROOT_CONTEXT);

    expect(span.attributes[ATTR_URL_FULL]).toBe('http://tolgee:8080/v2/projects?page=1');
  });

  it('touches nothing on a span that is not a fetch', () => {
    const span = startedSpan('GET /', { [ATTR_HTTP_ROUTE]: '/' });

    new FetchSpanNameProcessor().onStart(span, ROOT_CONTEXT);

    expect(span.name).toBe('GET /');
    expect(span.attributes[ATTR_URL_FULL]).toBeUndefined();
  });

  it('exports nothing and needs no flushing of its own', async () => {
    const processor = new FetchSpanNameProcessor();

    expect(processor.onEnd({} as ReadableSpan)).toBeUndefined();
    await expect(processor.forceFlush()).resolves.toBeUndefined();
    await expect(processor.shutdown()).resolves.toBeUndefined();
  });
});

describe('next request spans', () => {
  it('recognises a request span whether or not it resolved a route', () => {
    expect(isRequestSpan(nextRequestSpan('/'))).toBe(true);
    expect(isRequestSpan(nextRequestSpan())).toBe(true);
  });

  it('keeps the server span of a service whose framework does not name its own', () => {
    expect(isRequestSpan(endedSpan(SpanKind.SERVER, { 'http.request.method': 'GET' }))).toBe(false);
  });

  it('keeps outgoing calls, which are never a duplicate of the request', () => {
    expect(isRequestSpan(endedSpan(SpanKind.CLIENT, { 'next.span_type': 'AppRender.fetch' }))).toBe(
      false
    );
  });

  it('marks only the pass Next itself bubbled out of', () => {
    expect(isRedispatchPass(redispatchPass())).toBe(true);
    expect(isRedispatchPass(nextRequestSpan())).toBe(false);
    expect(isRedispatchPass(nextRequestSpan('/'))).toBe(false);
  });

  it('never marks a routed span, whatever Next bubbled', () => {
    const routedAndBubbled = endedSpan(SpanKind.SERVER, {
      'next.span_type': 'BaseServer.handleRequest',
      [ATTR_HTTP_ROUTE]: '/stats',
      'next.bubble': true,
    });

    expect(isRedispatchPass(routedAndBubbled)).toBe(false);
  });

  it('pairs a pass with a second pass over the same method and target', () => {
    expect(requestSpanKey(nextRequestSpan(undefined, '/missing'))).toBe('GET /missing');
    expect(requestSpanKey(endedSpan(SpanKind.SERVER, {}))).toBe(' ');
  });
});

describe('redispatched request span filter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports one span for a routed request, and it is the routed one', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);
    const routed = nextRequestSpan('/', '/', 10, 40);

    filter.onEnd(redispatchPass('/', 0, 5));
    filter.onEnd(routed);

    expect(delegate.onEnd).toHaveBeenCalledOnce();
    expect(delegate.onEnd).toHaveBeenCalledWith(routed);
  });

  it('exports one span for a request that matched no route, and keeps its children attached', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);
    const notFound = nextRequestSpan(undefined, '/missing', 10, 40);

    filter.onEnd(redispatchPass('/missing', 0, 5));
    filter.onEnd(notFound);

    expect(delegate.onEnd).toHaveBeenCalledOnce();
    expect(delegate.onEnd).toHaveBeenCalledWith(notFound);
  });

  it('exports the inner dispatch that never ran middleware, so the image optimiser stays visible', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);
    const image = nextRequestSpan(undefined, '/_next/image?url=%2Fa.png&w=640&q=75', 0, 5);

    filter.onEnd(image);

    expect(delegate.onEnd).toHaveBeenCalledWith(image);
  });

  it('exports a pass no second pass claimed, so a middleware redirect keeps its span', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);
    const redirect = redispatchPass('/go', 0, 5);

    filter.onEnd(redirect);
    expect(delegate.onEnd).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REDISPATCH_HOLD_MS);

    expect(delegate.onEnd).toHaveBeenCalledOnce();
    expect(delegate.onEnd).toHaveBeenCalledWith(redirect);
  });

  it('claims the pass held for its own target, not another request in flight', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);
    const redirect = redispatchPass('/go', 0, 5);
    const routed = nextRequestSpan('/', '/', 20, 40);

    filter.onEnd(redirect);
    filter.onEnd(redispatchPass('/', 10, 15));
    filter.onEnd(routed);

    expect(delegate.onEnd).toHaveBeenCalledOnce();
    expect(delegate.onEnd).toHaveBeenCalledWith(routed);

    vi.advanceTimersByTime(REDISPATCH_HOLD_MS);

    expect(delegate.onEnd).toHaveBeenCalledTimes(2);
    expect(delegate.onEnd).toHaveBeenLastCalledWith(redirect);
  });

  it('claims a pass that ended inside the millisecond the request span is stamped with', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);
    const pass = endedSpan(
      SpanKind.SERVER,
      {
        'next.span_type': 'BaseServer.handleRequest',
        'http.method': 'GET',
        'http.target': '/',
        'next.bubble': true,
      },
      at(0),
      [1790205018, 254082458]
    );
    const routed = endedSpan(
      SpanKind.SERVER,
      {
        'next.span_type': 'BaseServer.handleRequest',
        'http.method': 'GET',
        'http.target': '/',
        [ATTR_HTTP_ROUTE]: '/',
      },
      [1790205018, 254000000],
      [1790205018, 263819000]
    );

    filter.onEnd(pass);
    filter.onEnd(routed);
    vi.advanceTimersByTime(REDISPATCH_HOLD_MS);

    expect(delegate.onEnd).toHaveBeenCalledOnce();
    expect(delegate.onEnd).toHaveBeenCalledWith(routed);
  });

  it('leaves a pass that outlived the request span for a later successor', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);
    const late = redispatchPass('/', 30, 50);

    filter.onEnd(late);
    filter.onEnd(nextRequestSpan('/', '/', 10, 40));

    vi.advanceTimersByTime(REDISPATCH_HOLD_MS);

    expect(delegate.onEnd).toHaveBeenCalledTimes(2);
    expect(delegate.onEnd).toHaveBeenLastCalledWith(late);
  });

  it('exports two concurrent requests as two spans, whichever pass each one claims', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);

    filter.onEnd(redispatchPass('/dashboard', 0, 5));
    filter.onEnd(redispatchPass('/dashboard', 6, 10));
    filter.onEnd(nextRequestSpan('/dashboard', '/dashboard', 11, 40));

    vi.advanceTimersByTime(REDISPATCH_HOLD_MS);

    expect(delegate.onEnd).toHaveBeenCalledTimes(2);
  });

  it('exports the oldest held pass rather than growing without a bound', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate, 2);
    const first = redispatchPass('/a', 0, 1);

    filter.onEnd(first);
    filter.onEnd(redispatchPass('/b', 2, 3));
    filter.onEnd(redispatchPass('/c', 4, 5));

    expect(delegate.onEnd).toHaveBeenCalledOnce();
    expect(delegate.onEnd).toHaveBeenCalledWith(first);
  });

  it('exports everything it still holds when the process flushes or stops', async () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);

    filter.onEnd(redispatchPass('/go', 0, 5));
    await filter.forceFlush();

    expect(delegate.onEnd).toHaveBeenCalledOnce();
    expect(delegate.forceFlush).toHaveBeenCalledOnce();

    filter.onEnd(redispatchPass('/denied', 6, 10));
    await filter.shutdown();

    expect(delegate.onEnd).toHaveBeenCalledTimes(2);
    expect(delegate.shutdown).toHaveBeenCalledOnce();
  });

  it('starts every span through the processor it wraps', () => {
    const delegate = recordingDelegate();
    const filter = filterOver(delegate);
    const span = startedSpan('GET /');

    filter.onStart(span, ROOT_CONTEXT);

    expect(delegate.onStart).toHaveBeenCalledWith(span, ROOT_CONTEXT);
  });
});
