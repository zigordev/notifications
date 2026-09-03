// DO NOT EDIT. Vendored from platform-ops/packages/observability.
// Change it there and run: bash platform-ops/scripts/sync-observability.sh

import type { NextFunction, Request, Response } from 'express';
import * as client from 'prom-client';
import { registry } from './metrics.registry';

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

/**
 * The two metrics every alert in `platform-ops/docker/prometheus/` is built on:
 * a request counter and a duration histogram, both labelled by method, route
 * and status.
 *
 * `route` is the Express route *pattern* (`/pools/:id`), never the resolved
 * path. A label whose value is an id gives Prometheus one time series per id,
 * which is the classic way to melt a Prometheus server.
 */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;

    const route =
      (req.route?.path as string | undefined) ??
      (req.baseUrl ? `${req.baseUrl}${req.path}` : req.path);
    if (!route) return;

    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels, 1);
    httpRequestDuration.observe(labels, seconds);
  });

  next();
}
