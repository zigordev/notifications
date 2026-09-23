import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { logServiceStopping } from './standard-events';

@Injectable()
export class LifecycleService implements OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void {
    logServiceStopping(signal ?? 'shutdown');
  }
}
