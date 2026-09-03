import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTelemetry } from './observability/tracing';

/**
 * Flushes spans as part of Nest's ordered shutdown, so the last traces before a
 * deploy survive. The kit also handles SIGTERM/SIGINT for services that are not
 * Nest; `shutdownTelemetry` is guarded, so both paths firing is harmless.
 */
@Injectable()
export class TelemetryLifecycleService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownTelemetry();
  }
}
