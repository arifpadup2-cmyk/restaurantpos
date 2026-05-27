-- Cloud sync state tracking (used by local server daemon and cloud server)
CREATE TABLE IF NOT EXISTS cloud_sync_state (
  entity       TEXT         PRIMARY KEY,
  last_push_at BIGINT       NOT NULL DEFAULT 0,
  last_pull_at BIGINT       NOT NULL DEFAULT 0,
  push_count   BIGINT       NOT NULL DEFAULT 0,
  last_error   TEXT,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
