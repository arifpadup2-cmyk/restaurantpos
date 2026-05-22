-- Migration 003: Local update transaction log
-- Immutable append-only audit trail for every update event on this terminal.
-- Rows are synced to central PG in Phase 3; never deleted locally.
-- Partitioned version lives on central PG (Phase 6).

CREATE TABLE IF NOT EXISTS update_transaction_log (
  id            SERIAL PRIMARY KEY,
  event_type    TEXT        NOT NULL,
  status        TEXT        NOT NULL,
  from_version  TEXT,
  to_version    TEXT,
  machine_id    TEXT        NOT NULL,
  triggered_by  TEXT        NOT NULL DEFAULT 'auto',
  shift_open    BOOLEAN     NOT NULL DEFAULT false,
  open_orders   INTEGER     NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  error_message TEXT,
  db_row_counts JSONB,
  checksum      TEXT,
  lock_mode     TEXT,
  fence_token   BIGINT,
  synced        SMALLINT    NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utl_created ON update_transaction_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_utl_failed  ON update_transaction_log(status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_utl_synced  ON update_transaction_log(synced)  WHERE synced = 0;
