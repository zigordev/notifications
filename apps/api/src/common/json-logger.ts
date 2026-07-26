import { Injectable, LoggerService } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

type LogLevel = 'debug' | 'error' | 'info' | 'warn';

@Injectable()
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, traceValue?: string, context?: string): void {
    this.write('error', message, context, traceValue);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    const spanContext = trace.getActiveSpan()?.spanContext();
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: 'notifications-api',
      message: this.normalizeMessage(message),
    };

    if (context) {
      record.context = context;
    }
    if (spanContext?.traceId) {
      record.traceId = spanContext.traceId;
      record.spanId = spanContext.spanId;
    }
    if (stack) {
      record.stack = stack;
    }

    const output = JSON.stringify(record);
    if (level === 'error') {
      process.stderr.write(`${output}\n`);
    } else {
      process.stdout.write(`${output}\n`);
    }
  }

  private normalizeMessage(message: unknown): unknown {
    if (message instanceof Error) {
      return message.message;
    }
    return message;
  }
}
