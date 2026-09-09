/**
 * The observability kit.
 *
 * `tracing` is deliberately NOT re-exported here: it must be imported first,
 * before any instrumented module loads, so services import it directly as a
 * side effect (`import './observability/tracing';`) on the first line of
 * `main.ts`. Re-exporting it through this barrel would let it load late and
 * silently instrument nothing.
 */
export { kafkaLogCreator, writeLogRecord } from './json-logger';
export type { LogLevel } from './json-logger';
export { registry } from './metrics.registry';
export { httpMetricsMiddleware } from './http-metrics.middleware';
export { JsonLogger, MetricsController, ObservabilityModule } from './nest';
export { allFlags, isEnabled, registerFlags } from './feature-flags';
export type { FlagDefinition, ResolvedFlag } from './feature-flags';
export { recordHealth } from './health-metrics';
