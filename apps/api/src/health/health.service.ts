import { Injectable } from '@nestjs/common';
import { JsonLogger, recordHealth } from '../observability';
import { DatabaseService } from '../database/database.service';
import { EmailSenderService } from '../email/email-sender.service';
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
    smtp: HealthComponent;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly kafka: NotificationConsumerService,
    private readonly emailSender: EmailSenderService,
    private readonly logger: JsonLogger
  ) {}

  /** Kafka is required, not optional: this service consumes its topic, and a
   *  consumer that has dropped out of its group stops working silently. The
   *  relay is required for the same reason — a service that cannot send email
   *  is not healthy, whatever else is working, and that was the difference
   *  between a revoked login and a week of silently dead-lettered contact
   *  messages. */
  async check(): Promise<HealthBody> {
    let databaseHealthy = true;
    try {
      await this.database.ping();
    } catch {
      databaseHealthy = false;
      if (!this.database.isClosing()) {
        this.logger.warn('PostgreSQL readiness check failed', HealthService.name);
      }
    }
    const kafkaHealthy = this.kafka.isReady();
    const smtpHealthy = this.emailSender.isAvailable();
    const status =
      databaseHealthy && kafkaHealthy && smtpHealthy ? ('ok' as const) : ('error' as const);
    const components = {
      db: { status: databaseHealthy ? ('up' as const) : ('down' as const) },
      kafka: { status: kafkaHealthy ? ('up' as const) : ('down' as const) },
      smtp: { status: smtpHealthy ? ('up' as const) : ('down' as const) },
    };

    // The same judgement the response carries, as a metric, so a rule can read
    // it. Without this the health contract is invisible to alerting.
    recordHealth(status, components);

    return { status, service: SERVICE_NAME, components };
  }
}
