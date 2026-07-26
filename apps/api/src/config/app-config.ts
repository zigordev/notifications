import { InjectionToken } from '@nestjs/common';

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface KafkaConfig {
  bootstrapServers: string[];
  consumerGroupId: string;
  emailTopic: string;
  emailDltTopic: string;
  retryIntervalMs: number;
  retryMaxAttempts: number;
  processingLeaseMs: number;
}

export interface SmtpConfig {
  host: string;
  port: number;
  auth: boolean;
  startTls: boolean;
  user: string;
  password: string;
  from: string;
  provider: string;
}

export interface TelemetryConfig {
  tracingEnabled: boolean;
  otlpEndpoint: string;
  serviceName: string;
}

export interface AppConfig {
  port: number;
  trustProxy: boolean;
  database: DatabaseConfig;
  kafka: KafkaConfig;
  smtp: SmtpConfig;
  telemetry: TelemetryConfig;
}

export const APP_CONFIG: InjectionToken<AppConfig> = Symbol('APP_CONFIG');

function stringValue(name: string, fallback: string): string {
  const value = process.env[name]?.trim() ?? fallback;
  if (value.length === 0 && fallback.length > 0) {
    throw new Error(`${name} must not be blank`);
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function booleanValue(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`${name} must be either "true" or "false"`);
}

export function loadAppConfig(): AppConfig {
  const bootstrapServers = stringValue('KAFKA_BOOTSTRAP_SERVERS', 'platform-redpanda:9092')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);

  if (bootstrapServers.length === 0) {
    throw new Error('KAFKA_BOOTSTRAP_SERVERS must contain at least one broker');
  }

  return {
    port: positiveInteger('PORT', 8080),
    trustProxy: booleanValue('TRUST_PROXY', false),
    database: {
      host: stringValue('DB_HOST', 'localhost'),
      port: positiveInteger('DB_PORT', 5432),
      user: stringValue('DB_USER', 'app'),
      password: stringValue('DB_PASSWORD', 'app'),
      database: stringValue('DB_NAME', 'notifications'),
    },
    kafka: {
      bootstrapServers,
      consumerGroupId: stringValue('KAFKA_CONSUMER_GROUP_ID', 'notifications-api'),
      emailTopic: stringValue('NOTIFICATIONS_EMAIL_TOPIC', 'notification.email.requested.v1'),
      emailDltTopic: stringValue(
        'NOTIFICATIONS_EMAIL_DLT_TOPIC',
        'notification.email.requested.v1.DLT'
      ),
      retryIntervalMs: positiveInteger('NOTIFICATIONS_RETRY_INTERVAL_MS', 5000),
      retryMaxAttempts: positiveInteger('NOTIFICATIONS_RETRY_MAX_ATTEMPTS', 4),
      processingLeaseMs: positiveInteger('NOTIFICATIONS_PROCESSING_LEASE_MS', 60_000),
    },
    smtp: {
      host: stringValue('SMTP_HOST', 'smtp.gmail.com'),
      port: positiveInteger('SMTP_PORT', 587),
      auth: booleanValue('SMTP_AUTH', true),
      startTls: booleanValue('SMTP_STARTTLS', true),
      user: stringValue('SMTP_USER', ''),
      password: stringValue('SMTP_PASS', ''),
      from: stringValue('SMTP_FROM', 'noreply@example.com'),
      provider: 'gmail-smtp',
    },
    telemetry: {
      tracingEnabled: booleanValue('MANAGEMENT_TRACING_ENABLED', true),
      otlpEndpoint: stringValue(
        'OTEL_EXPORTER_OTLP_ENDPOINT',
        'http://otel-collector:4318/v1/traces'
      ),
      serviceName: stringValue('OTEL_SERVICE_NAME', 'notifications-api'),
    },
  };
}
