import { Module } from '@nestjs/common';
import { ObservabilityModule } from './observability';
import { APP_CONFIG, loadAppConfig } from './config/app-config';
import { DatabaseService } from './database/database.service';
import {
  createEmailTransport,
  EMAIL_TRANSPORT,
  EmailSenderService,
} from './email/email-sender.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { NotificationConsumerService } from './kafka/notification-consumer.service';
import { RetryExecutor } from './kafka/retry-executor';
import { NotificationMetricsService } from './metrics/notification-metrics.service';
import { NotificationProcessorService } from './notifications/notification-processor.service';
import { NotificationRepository } from './notifications/notification.repository';
import { TelemetryLifecycleService } from './telemetry-lifecycle.service';
import { TemplateCatalogService } from './templates/template-catalog.service';

@Module({
  // Brings `/metrics`, the shared prom-client registry, and the JSON logger.
  imports: [ObservabilityModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: loadAppConfig,
    },
    DatabaseService,
    TemplateCatalogService,
    {
      provide: EMAIL_TRANSPORT,
      inject: [APP_CONFIG],
      useFactory: createEmailTransport,
    },
    EmailSenderService,
    NotificationRepository,
    NotificationMetricsService,
    NotificationProcessorService,
    RetryExecutor,
    NotificationConsumerService,
    HealthService,
    TelemetryLifecycleService,
  ],
})
export class AppModule {}
