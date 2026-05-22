-- Migration 009: Audit log for theft prevention and management oversight
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  action      TEXT    NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  cashier_id  TEXT,
  cashier_name TEXT,
  approved_by TEXT,
  details     TEXT,
  terminal_id TEXT,
  created_at  BIGINT  NOT NULL DEFAULT 0,
  synced      SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log(action);
