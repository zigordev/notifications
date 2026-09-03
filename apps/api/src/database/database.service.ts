import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { join } from 'node:path';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { JsonLogger } from '../observability';
import { runMigrations } from './migration-runner';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly logger: JsonLogger
  ) {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      application_name: config.telemetry.serviceName,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
      max: 10,
    });
    this.pool.on('error', (error) => {
      this.logger.error(
        `Unexpected idle PostgreSQL client error: ${error.message}`,
        error.stack,
        DatabaseService.name
      );
    });
  }

  async onModuleInit(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      await runMigrations(client, join(__dirname, '../resources/db/migration'));
      this.logger.log(
        'PostgreSQL connection established and migrations applied',
        DatabaseService.name
      );
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, [...values]);
  }

  connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
}
