import './instrumentation';
import 'reflect-metadata';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { JsonLogger } from './common/json-logger';
import { APP_CONFIG, AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  // Security headers. CSP is off: this is a JSON API, where a content policy
  // buys nothing, and both gpool and kini serve Swagger UI, which needs the
  // inline scripts a default helmet CSP would block. The headers that matter
  // here — HSTS, nosniff, frame-options, referrer-policy — are all still set.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.useLogger(app.get(JsonLogger));
  app.set('trust proxy', config.trustProxy);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
