-- Migration 004: Sync retry queue
-- Stores failed API sync attempts so they are retried on next connectivity.
-- Prevents data loss when the API server is temporarily unreachable.

CREATE TABLE IF NOT EXISTS sync_queue (
  id          SERIAL      PRIMARY KEY,
  entity_type TEXT        NOT NULL,   -- 'order','expense','shift','day_closing'
  entity_id   TEXT        NOT NULL,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_retry  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sq_pending ON sync_queue(next_retry)
  WHERE attempts < 5;
