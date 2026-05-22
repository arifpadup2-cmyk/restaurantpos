-- Migration 001: Core business schema
-- Translated from SQLite (sql.js) to PostgreSQL 16
-- Timestamps stored as BIGINT (JS milliseconds) to preserve renderer compatibility
-- Boolean-like fields kept as SMALLINT (0/1) for same reason

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS cashiers (
  id         TEXT PRIMARY KEY,
  name       TEXT     NOT NULL,
  pin        TEXT,
  role       TEXT     NOT NULL DEFAULT 'cashier',
  active     SMALLINT NOT NULL DEFAULT 1,
  synced     SMALLINT NOT NULL DEFAULT 0,
  created_at BIGINT            DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT     NOT NULL,
  sort_order INTEGER  NOT NULL DEFAULT 0,
  color      TEXT     NOT NULL DEFAULT '#f97316',
  active     SMALLINT NOT NULL DEFAULT 1,
  synced_at  BIGINT
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          TEXT           PRIMARY KEY,
  category_id TEXT,
  name        TEXT           NOT NULL,
  price       NUMERIC(12,2)  NOT NULL,
  description TEXT,
  active      SMALLINT       NOT NULL DEFAULT 1,
  synced_at   BIGINT
);

CREATE TABLE IF NOT EXISTS tables_layout (
  id               TEXT PRIMARY KEY,
  name             TEXT     NOT NULL,
  capacity         INTEGER  NOT NULL DEFAULT 4,
  status           TEXT     NOT NULL DEFAULT 'available',
  current_order_id TEXT
);

CREATE TABLE IF NOT EXISTS shifts (
  id           TEXT PRIMARY KEY,
  cashier_id   TEXT,
  cashier_name TEXT,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(12,2),
  notes        TEXT,
  status       TEXT          NOT NULL DEFAULT 'open',
  opened_at    BIGINT,
  closed_at    BIGINT,
  synced       SMALLINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,
  order_number     TEXT,
  order_type       TEXT          NOT NULL,
  table_id         TEXT,
  table_name       TEXT,
  customer_name    TEXT,
  customer_phone   TEXT,
  customer_address TEXT,
  status           TEXT          NOT NULL DEFAULT 'active',
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate         REAL          NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_type    TEXT          NOT NULL DEFAULT 'none',
  discount_value   NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method   TEXT,
  payment_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  change_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  cashier_id       TEXT,
  cashier_name     TEXT,
  shift_id         TEXT,
  created_at       BIGINT,
  updated_at       BIGINT,
  billed_at        BIGINT,
  synced           SMALLINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
  id            TEXT PRIMARY KEY,
  order_id      TEXT          NOT NULL,
  item_id       TEXT          NOT NULL,
  item_name     TEXT          NOT NULL,
  category_name TEXT,
  quantity      INTEGER       NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL,
  total_price   NUMERIC(12,2) NOT NULL,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  category     TEXT          NOT NULL,
  description  TEXT,
  amount       NUMERIC(12,2) NOT NULL,
  cashier_id   TEXT,
  cashier_name TEXT,
  shift_id     TEXT,
  created_at   BIGINT,
  synced       SMALLINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS day_closings (
  id                   TEXT PRIMARY KEY,
  date                 TEXT          NOT NULL,
  total_orders         INTEGER       NOT NULL DEFAULT 0,
  total_sales          NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_sales           NUMERIC(12,2) NOT NULL DEFAULT 0,
  card_sales           NUMERIC(12,2) NOT NULL DEFAULT 0,
  online_payment_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expenses       NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_sales            NUMERIC(12,2) NOT NULL DEFAULT 0,
  dine_in_count        INTEGER       NOT NULL DEFAULT 0,
  takeaway_count       INTEGER       NOT NULL DEFAULT 0,
  delivery_count       INTEGER       NOT NULL DEFAULT 0,
  online_count         INTEGER       NOT NULL DEFAULT 0,
  closed_by            TEXT,
  closed_at            BIGINT,
  notes                TEXT,
  synced               SMALLINT      NOT NULL DEFAULT 0
);
