ALTER TABLE notification_requests
  ADD COLUMN IF NOT EXISTS processing_owner TEXT,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notification_requests_processing_lease
  ON notification_requests(status, processing_started_at)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS notification_dead_letters (
  dlt_id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES notification_requests(request_id) ON DELETE SET NULL,
  original_message_id TEXT,
  idempotency_key TEXT,
  topic TEXT NOT NULL,
  partition_id INTEGER NOT NULL,
  message_offset TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  error_message TEXT NOT NULL,
  source_app TEXT,
  template_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(topic, partition_id, message_offset)
);

CREATE INDEX IF NOT EXISTS idx_notification_dead_letters_request
  ON notification_dead_letters(request_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_dead_letters_received
  ON notification_dead_letters(received_at DESC);
