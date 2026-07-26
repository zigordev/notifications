import { loadAppConfig } from './app-config';

describe('loadAppConfig', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = {};
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('retains the established service defaults', () => {
    const config = loadAppConfig();

    expect(config).toMatchObject({
      port: 8080,
      trustProxy: false,
      database: {
        host: 'localhost',
        port: 5432,
        user: 'app',
        password: 'app',
        database: 'notifications',
      },
      kafka: {
        bootstrapServers: ['platform-redpanda:9092'],
        consumerGroupId: 'notifications-api',
        emailTopic: 'notification.email.requested.v1',
        emailDltTopic: 'notification.email.requested.v1.DLT',
        retryIntervalMs: 5000,
        retryMaxAttempts: 4,
        processingLeaseMs: 60_000,
      },
      smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        auth: true,
        startTls: true,
        from: 'noreply@example.com',
        provider: 'gmail-smtp',
      },
      telemetry: {
        tracingEnabled: true,
        serviceName: 'notifications-api',
      },
    });
  });

  it('parses the existing environment interface and comma-separated brokers', () => {
    process.env = {
      PORT: '9090',
      TRUST_PROXY: 'true',
      DB_HOST: 'postgres',
      DB_PORT: '5544',
      DB_USER: 'notifications',
      DB_PASSWORD: 'secret',
      DB_NAME: 'audit',
      KAFKA_BOOTSTRAP_SERVERS: 'broker-1:9092, broker-2:9092',
      KAFKA_CONSUMER_GROUP_ID: 'notifications-test',
      NOTIFICATIONS_EMAIL_TOPIC: 'email.v1',
      NOTIFICATIONS_EMAIL_DLT_TOPIC: 'email.v1.DLT',
      NOTIFICATIONS_RETRY_INTERVAL_MS: '25',
      NOTIFICATIONS_RETRY_MAX_ATTEMPTS: '2',
      NOTIFICATIONS_PROCESSING_LEASE_MS: '30000',
      SMTP_HOST: 'mailpit',
      SMTP_PORT: '1025',
      SMTP_AUTH: 'false',
      SMTP_STARTTLS: 'false',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      SMTP_FROM: 'from@example.com',
      MANAGEMENT_TRACING_ENABLED: 'false',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector/v1/traces',
      OTEL_SERVICE_NAME: 'notifications-test',
    };

    const config = loadAppConfig();

    expect(config.port).toBe(9090);
    expect(config.trustProxy).toBe(true);
    expect(config.kafka.bootstrapServers).toEqual(['broker-1:9092', 'broker-2:9092']);
    expect(config.kafka.processingLeaseMs).toBe(30_000);
    expect(config.smtp).toMatchObject({
      host: 'mailpit',
      port: 1025,
      auth: false,
      startTls: false,
      user: 'user',
      password: 'pass',
      from: 'from@example.com',
    });
    expect(config.telemetry).toEqual({
      tracingEnabled: false,
      otlpEndpoint: 'http://collector/v1/traces',
      serviceName: 'notifications-test',
    });
  });

  it.each([
    ['PORT', '0'],
    ['DB_PORT', 'not-a-number'],
    ['TRUST_PROXY', 'yes'],
    ['SMTP_AUTH', '1'],
    ['NOTIFICATIONS_RETRY_MAX_ATTEMPTS', '-1'],
  ])('rejects invalid %s values at startup', (name, value) => {
    process.env = { [name]: value };
    expect(() => loadAppConfig()).toThrow(name);
  });

  it('rejects a blank Kafka broker list', () => {
    process.env = { KAFKA_BOOTSTRAP_SERVERS: ' ' };
    expect(() => loadAppConfig()).toThrow('KAFKA_BOOTSTRAP_SERVERS');
  });
});
