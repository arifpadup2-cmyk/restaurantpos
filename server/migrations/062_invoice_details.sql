-- Invoice detail fields: waiter, completion time, complimentary/cancelled totals,
-- and per-line payment breakdown (split payments) so every invoice can show
-- exactly what was charged and how it was paid.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_id        TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_name      TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at     BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comp_amount      NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_amount NUMERIC NOT NULL DEFAULT 0;

-- One row per tender. A single-method payment is one row; a split is N rows.
CREATE TABLE IF NOT EXISTS order_payments (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL,
  method     TEXT NOT NULL,
  amount     NUMERIC NOT NULL DEFAULT 0,
  reference  TEXT,
  created_at BIGINT,
  outlet_id  TEXT,
  brand_id   TEXT,
  synced     SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
