import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { internalProblem, problemFromException, problemTypeFor } from './problem-details';

describe('problemFromException', () => {
  it('carries the code and params a throw supplies', () => {
    const problem = problemFromException(
      new NotFoundException({
        code: 'NOTIFICATION.NOT_FOUND',
        message: 'Notification 7f3a not found',
        params: { notificationId: '7f3a' },
      }),
      '/health'
    );

    expect(problem).toEqual({
      type: 'https://zigordev.com/problems/notification-not-found',
      title: 'Not found',
      status: 404,
      detail: 'Notification 7f3a not found',
      instance: '/health',
      code: 'NOTIFICATION.NOT_FOUND',
      params: { notificationId: '7f3a' },
    });
  });

  it('derives a code from the status when the throw is a bare string', () => {
    const problem = problemFromException(new ForbiddenException('Not allowed'), '/health');

    expect(problem.code).toBe('HTTP.FORBIDDEN');
    expect(problem.detail).toBe('Not allowed');
    expect(problem.type).toBe('https://zigordev.com/problems/http-forbidden');
  });

  it('joins the array a validation failure produces under one code', () => {
    const problem = problemFromException(
      new BadRequestException({
        statusCode: 400,
        message: ['name should not be empty', 'size must be a number'],
        error: 'Bad Request',
      }),
      '/health'
    );

    expect(problem.code).toBe('VALIDATION.FAILED');
    expect(problem.detail).toBe('name should not be empty; size must be a number');
  });

  it('says nothing about why a 5xx happened', () => {
    const problem = problemFromException(
      new InternalServerErrorException('relation "notification" does not exist'),
      '/health'
    );

    expect(problem.detail).toBeUndefined();
    expect(problem.params).toBeUndefined();
    expect(problem.status).toBe(500);
  });

  it('keeps a status that has no table entry', () => {
    const problem = problemFromException(
      new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
      '/health'
    );

    expect(problem.status).toBe(418);
    expect(problem.title).toBe('Error');
    expect(problem.code).toBe('HTTP.ERROR');
  });
});

describe('internalProblem', () => {
  it('describes a non-HttpException without leaking it', () => {
    expect(internalProblem('/health')).toEqual({
      type: problemTypeFor('HTTP.INTERNAL_ERROR'),
      title: 'Internal server error',
      status: 500,
      instance: '/health',
      code: 'HTTP.INTERNAL_ERROR',
    });
  });
});
