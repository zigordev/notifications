import { Injectable } from '@nestjs/common';
import { JsonLogger } from '../common/json-logger';
import { DatabaseService } from '../database/database.service';
import { NotificationConsumerService } from '../kafka/notification-consumer.service';

/** Matches `OTEL_SERVICE_NAME`, so health, metrics, traces and logs all name
 *  this service identically. */
export const SERVICE_NAME = 'notifications-api';

export interface HealthComponent {
  status: 'down' | 'up';
}

export interface HealthBody {
  status: 'error' | 'ok';
  service: string;
  components: {
    db: HealthComponent;
    kafka: HealthComponent;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly kafka: NotificationConsumerService,
    private readonly logger: JsonLogger
  ) {}

  async readiness(): Promise<HealthBody> {
    let databaseHealthy = true;
    try {
      await this.database.ping();
    } catch {
      databaseHealthy = false;
      this.logger.warn('PostgreSQL readiness check failed', HealthService.name);
    }
    const kafkaHealthy = this.kafka.isReady();
    return {
      status: databaseHealthy && kafkaHealthy ? 'ok' : 'error',
      service: SERVICE_NAME,
      components: {
        db: { status: databaseHealthy ? 'up' : 'down' },
        kafka: { status: kafkaHealthy ? 'up' : 'down' },
      },
    };
  }
}
