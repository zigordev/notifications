import { HttpException, HttpStatus } from '@nestjs/common';

export const PROBLEM_TYPE_BASE = 'https://zigordev.com/problems';
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  params?: Record<string, unknown>;
}

const TITLES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal server error',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service unavailable',
};

const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'HTTP.BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'HTTP.UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'HTTP.FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'HTTP.NOT_FOUND',
  [HttpStatus.CONFLICT]: 'HTTP.CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'HTTP.UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'HTTP.TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'HTTP.SERVICE_UNAVAILABLE',
};

export const problemTypeFor = (code: string): string =>
  `${PROBLEM_TYPE_BASE}/${code.toLowerCase().replace(/[._]/g, '-')}`;

const titleFor = (status: number): string => TITLES[status] ?? 'Error';

const codeFor = (status: number): string =>
  DEFAULT_CODES[status] ?? (status >= 500 ? 'HTTP.INTERNAL_ERROR' : 'HTTP.ERROR');

const detailFrom = (message: unknown): string | undefined => {
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message) && message.length > 0) {
    return message.filter((entry) => typeof entry === 'string').join('; ') || undefined;
  }
  return undefined;
};

const paramsFrom = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const problemFromException = (
  exception: HttpException,
  instance: string
): ProblemDetails => {
  const status = exception.getStatus();
  const payload = exception.getResponse();
  const body = paramsFrom(payload) ?? {};
  const isValidationFailure = Array.isArray(body.message);

  const code =
    typeof body.code === 'string'
      ? body.code
      : isValidationFailure
        ? 'VALIDATION.FAILED'
        : codeFor(status);

  const problem: ProblemDetails = {
    type: problemTypeFor(code),
    title: typeof body.title === 'string' ? body.title : titleFor(status),
    status,
    instance,
    code,
  };

  // A 5xx body says what failed and nothing about why: an ORM message or a
  // driver error text reaching a client is how internals leak.
  if (status < 500) {
    const detail = typeof payload === 'string' ? payload : detailFrom(body.message);
    if (detail) problem.detail = detail;

    const params = paramsFrom(body.params);
    if (params) problem.params = params;
  }

  return problem;
};

export const internalProblem = (instance: string): ProblemDetails => ({
  type: problemTypeFor('HTTP.INTERNAL_ERROR'),
  title: titleFor(HttpStatus.INTERNAL_SERVER_ERROR),
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  instance,
  code: 'HTTP.INTERNAL_ERROR',
});
