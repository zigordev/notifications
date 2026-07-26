import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { telemetrySdk } from './instrumentation';

@Injectable()
export class TelemetryLifecycleService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await telemetrySdk?.shutdown();
  }
}
