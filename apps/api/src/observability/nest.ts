// DO NOT EDIT. Vendored from platform-ops/packages/observability.
// Change it there and run: bash platform-ops/scripts/sync-observability.sh

import { Controller, Get, Header, Injectable, LoggerService, Module } from '@nestjs/common';
import { Registry } from 'prom-client';
import { writeLogRecord } from './json-logger';
import { registry } from './metrics.registry';

/** The NestJS adapter. Everything else in the kit is framework-free. */

// No Swagger decorators: `/metrics` is scraped by Prometheus, not browsed in
// a docs UI, and decorating it would make the whole kit depend on
// `@nestjs/swagger` — which notifications does not install.
@Controller('metrics')
export class MetricsController {
  constructor(private readonly registry: Registry) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

/**
 * Nest's `LoggerService` over `writeLogRecord`, so framework logs — bootstrap,
 * route mapping, unhandled exceptions — land in Loki in the same shape and with
 * the same `traceId` as application logs.
 *
 * Install it with `app.useLogger(app.get(JsonLogger))` after the app is
 * created, and `new NestFactory.create(AppModule, { bufferLogs: true })` so the
 * lines emitted during bootstrap are replayed through it rather than lost.
 */
@Injectable()
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    writeLogRecord('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    writeLogRecord('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    writeLogRecord('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    writeLogRecord('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    writeLogRecord('debug', message, context);
  }
}

/**
 * Import this once in the root module. It brings `/metrics`, the shared
 * registry, and the JSON logger — the three things every service needs and
 * none of which is worth wiring separately.
 */
@Module({
  controllers: [MetricsController],
  providers: [{ provide: Registry, useValue: registry }, JsonLogger],
  exports: [Registry, JsonLogger],
})
export class ObservabilityModule {}
