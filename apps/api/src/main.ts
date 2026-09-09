// FIRST, above every other import. OpenTelemetry instruments by patching
// modules as they load, so anything required before this line goes untraced.
// Do not let a formatter or an import sorter move it.
import './observability/tracing';

import 'reflect-metadata';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { httpMetricsMiddleware, JsonLogger } from './observability';
import { APP_CONFIG, AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
          'frame-ancestors': ["'none'"],
        },
      },
    })
  );

  app.useLogger(app.get(JsonLogger));
  // `http_requests_total` and `http_request_duration_seconds` — the two metrics
  // every recording rule and alert in platform-ops aggregates on. Without this
  // the service is scraped but produces nothing the shared alerts can use.
  app.use(httpMetricsMiddleware);
  app.set('trust proxy', config.trustProxy);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
