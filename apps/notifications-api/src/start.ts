import { type Server as Serving, type Signal, serve } from '@zigordev/api';
import type { Env } from '@zigordev/config';
import { createLogger, type Logger, logProcessCrashes } from '@zigordev/otel';
import { type App, buildApp } from './app.ts';
import { type Config, readConfig } from './config.ts';

export { type Signal, stopOnSignals } from '@zigordev/api';

export interface StartOptions {
  readonly env?: Env;
  readonly logger?: Logger;
}

export interface Server extends Serving {
  readonly app: App;
  readonly config: Config;
}

export async function start(options: StartOptions = {}): Promise<Server> {
  const config = readConfig(options.env);
  const logger =
    options.logger ??
    createLogger({
      service: config.OTEL_SERVICE_NAME,
      release: config.OTEL_SERVICE_VERSION,
      level: config.LOG_LEVEL,
    });
  const stopWatching = logProcessCrashes(logger);
  const app = await buildApp({ config, logger });
  const serving = await serve(app, { port: config.PORT, host: config.HOST, logger });
  return {
    app,
    config,
    stop: async (signal: Signal) => {
      const code = await serving.stop(signal);
      stopWatching();
      return code;
    },
  };
}
