DROP INDEX IF EXISTS idx_orders_order_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders (order_number);
