-- Terminal log uploads: stores log entries pushed from POS terminals to the cloud
CREATE TABLE IF NOT EXISTS terminal_log_uploads (
  id            TEXT        PRIMARY KEY,
  brand_id      TEXT        NOT NULL,
  outlet_id     TEXT,
  outlet_code   TEXT,
  outlet_name   TEXT,
  terminal_name TEXT,
  terminal_id   TEXT,
  device_ip     TEXT,
  version       TEXT,

  -- Log entry fields
  log_timestamp TIMESTAMPTZ NOT NULL,
  level         TEXT        NOT NULL DEFAULT 'INFO',
  module        TEXT,
  screen        TEXT,
  action        TEXT        NOT NULL,

  -- User context
  user_id       TEXT,
  user_name     TEXT,
  user_role     TEXT,

  -- Extra JSON payload (already masked)
  extra         JSONB,

  -- When it was uploaded
  uploaded_at   BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_tlu_brand    ON terminal_log_uploads (brand_id);
CREATE INDEX IF NOT EXISTS idx_tlu_outlet   ON terminal_log_uploads (outlet_id);
CREATE INDEX IF NOT EXISTS idx_tlu_terminal ON terminal_log_uploads (terminal_id);
CREATE INDEX IF NOT EXISTS idx_tlu_level    ON terminal_log_uploads (level);
CREATE INDEX IF NOT EXISTS idx_tlu_ts       ON terminal_log_uploads (log_timestamp DESC);
