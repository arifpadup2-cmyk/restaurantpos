-- Order numbers are sequential PER OUTLET PER BUSINESS DAY (each outlet/day has
-- its own 001, 002, ...). The shared central DB holds many outlets, so the old
-- GLOBAL unique index on order_number caused "duplicate key value violates
-- unique constraint idx_orders_order_number" when a second outlet (or a new day)
-- generated the same number. Re-scope the uniqueness to (outlet_id, business_date).
DROP INDEX IF EXISTS idx_orders_order_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number
  ON orders (outlet_id, business_date, order_number);
