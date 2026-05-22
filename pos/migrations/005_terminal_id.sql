-- Migration 005: Terminal identity columns
-- Tracks which physical terminal created each record.
-- Enables per-terminal reporting and conflict tracing.

ALTER TABLE orders   ADD COLUMN IF NOT EXISTS terminal_id TEXT;
ALTER TABLE shifts   ADD COLUMN IF NOT EXISTS terminal_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS terminal_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_terminal ON orders(terminal_id);
