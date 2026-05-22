-- Migration 010: Commercial enhancements — void tracking, no-sale log, service charge settings
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

CREATE TABLE IF NOT EXISTS no_sale_log (
  id           TEXT PRIMARY KEY,
  reason       TEXT     NOT NULL,
  cashier_id   TEXT,
  cashier_name TEXT,
  terminal_id  TEXT,
  created_at   BIGINT   NOT NULL DEFAULT 0,
  synced       SMALLINT NOT NULL DEFAULT 0
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
  updated_at     BIGINT        NOT NULL DEFAULT 0,
  synced         SMALLINT      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- New settings keys (PostgreSQL syntax)
INSERT INTO settings(key, value) VALUES
  ('service_charge_rate',     '0'),
  ('service_charge_label',    'Service Charge'),
  ('mgr_discount_threshold',  '10'),
  ('require_void_reason',     '1'),
  ('branch_name',             ''),
  ('cash_variance_alert_pct', '5')
ON CONFLICT (key) DO NOTHING;
