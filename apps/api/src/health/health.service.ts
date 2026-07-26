import { Injectable } from '@nestjs/common';
import { JsonLogger } from '../common/json-logger';
import { DatabaseService } from '../database/database.service';
import { NotificationConsumerService } from '../kafka/notification-consumer.service';

export interface HealthComponent {
  status: 'DOWN' | 'UP';
}

export interface HealthBody {
  status: 'DOWN' | 'UP';
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
      status: databaseHealthy && kafkaHealthy ? 'UP' : 'DOWN',
      components: {
        db: { status: databaseHealthy ? 'UP' : 'DOWN' },
        kafka: { status: kafkaHealthy ? 'UP' : 'DOWN' },
      },
    };
  }
}
