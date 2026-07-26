import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { NotificationEvent, NotificationRequestState } from './notification-event';

interface NotificationRequestRow {
  request_id: string;
  status: string;
}

interface ClaimRow extends NotificationRequestRow {
  processing_started_at: Date | null;
}

export type NotificationClaim =
  | {
      kind: 'claimed';
      requestId: string;
      isNew: boolean;
    }
  | {
      kind: 'terminal';
      requestId: string;
      status: string;
    }
  | {
      kind: 'busy';
      requestId: string;
      status: string;
      retryAfterMs: number;
    };

export interface DeadLetterAudit {
  rawPayload: string;
  topic: string;
  partition: number;
  offset: string;
  error: string;
  event: NotificationEvent | null;
  requestId: string | null;
}

@Injectable()
export class NotificationRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<NotificationRequestState | null> {
    const result = await this.database.query<NotificationRequestRow>(
      `
        SELECT request_id, status
        FROM notification_requests
        WHERE idempotency_key = $1
        LIMIT 1
      `,
      [idempotencyKey]
    );
    const row = result.rows[0];
    return row ? { requestId: row.request_id, status: row.status } : null;
  }

  async claim(
    event: NotificationEvent,
    topic: string,
    rawPayload: string,
    traceId: string,
    processingOwner: string,
    leaseMs: number
  ): Promise<NotificationClaim> {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        event.idempotencyKey,
      ]);
      const insertResult = await client.query(
        `
          INSERT INTO notification_requests (
            request_id,
            idempotency_key,
            topic,
            source_app,
            channel,
            template_id,
            recipient_email,
            payload_json,
            status,
            trace_id,
            received_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'received', $9, NOW()
          )
          ON CONFLICT DO NOTHING
        `,
        [
          event.messageId,
          event.idempotencyKey,
          topic,
          event.sourceApp,
          event.channel,
          event.templateId,
          event.recipient.email,
          rawPayload,
          traceId,
        ]
      );
      const stateResult = await client.query<ClaimRow>(
        `
          SELECT request_id, status, processing_started_at
          FROM notification_requests
          WHERE idempotency_key = $1
          LIMIT 1
          FOR UPDATE
        `,
        [event.idempotencyKey]
      );
      const row = stateResult.rows[0];
      if (!row) {
        throw new Error(
          `Message id ${event.messageId} conflicts with an existing notification request`
        );
      }
      if (['sent', 'duplicate'].includes(row.status.toLowerCase())) {
        await client.query('COMMIT');
        return {
          kind: 'terminal',
          requestId: row.request_id,
          status: row.status,
        };
      }
      const leaseIsCurrent =
        row.status === 'processing' &&
        row.processing_started_at !== null &&
        row.processing_started_at.getTime() > Date.now() - leaseMs;
      if (leaseIsCurrent) {
        await client.query('COMMIT');
        return {
          kind: 'busy',
          requestId: row.request_id,
          status: row.status,
          retryAfterMs: Math.max(
            100,
            row.processing_started_at!.getTime() + leaseMs - Date.now() + 100
          ),
        };
      }
      await client.query(
        `
          UPDATE notification_requests
          SET
            status = 'processing',
            processing_owner = $1,
            processing_started_at = NOW(),
            error_message = NULL
          WHERE request_id = $2
        `,
        [processingOwner, row.request_id]
      );
      await client.query('COMMIT');
      return {
        kind: 'claimed',
        requestId: row.request_id,
        isNew: insertResult.rowCount === 1,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAttempt(
    requestId: string,
    provider: string,
    status: string,
    error: string | null,
    durationMs: number
  ): Promise<void> {
    await this.database.query(
      `
        INSERT INTO notification_attempts (
          attempt_id,
          request_id,
          provider,
          status,
          error_message,
          duration_ms,
          attempted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [randomUUID(), requestId, provider, status, truncate(error), durationMs]
    );
  }

  async markSent(requestId: string, processingOwner: string): Promise<void> {
    const result = await this.database.query(
      `
        UPDATE notification_requests
        SET
          status = 'sent',
          processed_at = NOW(),
          error_message = NULL,
          processing_owner = NULL,
          processing_started_at = NULL
        WHERE request_id = $1
          AND status = 'processing'
          AND processing_owner = $2
      `,
      [requestId, processingOwner]
    );
    ensureLeaseTransition(result.rowCount, requestId);
  }

  async markFailed(requestId: string, processingOwner: string, error: string): Promise<void> {
    const result = await this.database.query(
      `
        UPDATE notification_requests
        SET
          status = 'failed',
          processed_at = NOW(),
          error_message = $1,
          processing_owner = NULL,
          processing_started_at = NULL
        WHERE request_id = $2
          AND status = 'processing'
          AND processing_owner = $3
      `,
      [truncate(error), requestId, processingOwner]
    );
    ensureLeaseTransition(result.rowCount, requestId);
  }

  async markDeadLettered(requestId: string, error: string): Promise<void> {
    await this.database.query(
      `
        UPDATE notification_requests
        SET
          status = 'dead_lettered',
          processed_at = NOW(),
          error_message = $1,
          processing_owner = NULL,
          processing_started_at = NULL
        WHERE request_id = $2
          AND LOWER(status) NOT IN ('sent', 'duplicate')
      `,
      [truncate(error), requestId]
    );
  }

  async recordDeadLetter(audit: DeadLetterAudit): Promise<void> {
    await this.database.query(
      `
        INSERT INTO notification_dead_letters (
          dlt_id,
          request_id,
          original_message_id,
          idempotency_key,
          topic,
          partition_id,
          message_offset,
          raw_payload,
          error_message,
          source_app,
          template_id,
          received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (topic, partition_id, message_offset) DO NOTHING
      `,
      [
        randomUUID(),
        audit.requestId,
        audit.event?.messageId ?? null,
        audit.event?.idempotencyKey ?? null,
        audit.topic,
        audit.partition,
        audit.offset,
        audit.rawPayload,
        truncate(audit.error),
        audit.event?.sourceApp ?? null,
        audit.event?.templateId ?? null,
      ]
    );
  }
}

function truncate(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return value.length <= 2000 ? value : value.slice(0, 2000);
}

function ensureLeaseTransition(rowCount: number | null, requestId: string): void {
  if (rowCount !== 1) {
    throw new Error(`Processing lease lost for notification ${requestId}`);
  }
}
