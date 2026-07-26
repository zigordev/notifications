CREATE TABLE IF NOT EXISTS notification_requests (
  request_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  source_app TEXT NOT NULL,
  channel TEXT NOT NULL,
  template_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  trace_id TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_requests_status_received
  ON notification_requests(status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_requests_source_app
  ON notification_requests(source_app, received_at DESC);

CREATE TABLE IF NOT EXISTS notification_attempts (
  attempt_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES notification_requests(request_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_attempts_request
  ON notification_attempts(request_id, attempted_at DESC);
