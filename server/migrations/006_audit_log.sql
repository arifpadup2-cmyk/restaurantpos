-- Migration 006: Audit log, no_sale_log, customers on central PostgreSQL
-- Note: audit_log is also in pos/009_audit_log.sql which runs first.
-- All CREATE/ALTER use IF NOT EXISTS / IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  action       TEXT    NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  cashier_id   TEXT,
  cashier_name TEXT,
  approved_by  TEXT,
  details      TEXT,
  terminal_id  TEXT,
  created_at   BIGINT  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log(action);

CREATE TABLE IF NOT EXISTS no_sale_log (
  id           TEXT PRIMARY KEY,
  reason       TEXT     NOT NULL,
  cashier_id   TEXT,
  cashier_name TEXT,
  terminal_id  TEXT,
  created_at   BIGINT   NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT UNIQUE,
  email          TEXT,
  loyalty_points INTEGER       NOT NULL DEFAULT 0,
  total_spent    NUMERIC(12,2) NOT NULL DEFAULT 0,
  visit_count    INTEGER       NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     BIGINT        NOT NULL DEFAULT 0,
  updated_at     BIGINT        NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(name);

-- Extend central orders/items with new columns (safe with IF NOT EXISTS)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_reason           TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_by             TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_by           TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_rate   REAL          DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id           TEXT;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS voided_by   TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS voided_at   BIGINT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cancelled   SMALLINT DEFAULT 0;
