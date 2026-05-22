-- Migration 002: Performance and sync indexes

-- orders — most queried table
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shift_id     ON orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_orders_synced       ON orders(synced) WHERE synced = 0;

-- Unique order number — prevents double-billing
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- order_items — always queried by order_id
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- menu_items — category filter on active items only
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id) WHERE active = 1;

-- shifts — find open shift for cashier quickly
CREATE INDEX IF NOT EXISTS idx_shifts_cashier_status ON shifts(cashier_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_shifts_synced         ON shifts(synced) WHERE synced = 0;

-- expenses — report queries and sync
CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_synced   ON expenses(synced) WHERE synced = 0;

-- day_closings — report queries and sync
CREATE INDEX IF NOT EXISTS idx_day_closings_date   ON day_closings(date DESC);
CREATE INDEX IF NOT EXISTS idx_day_closings_synced ON day_closings(synced) WHERE synced = 0;

-- cashiers — sync
CREATE INDEX IF NOT EXISTS idx_cashiers_synced ON cashiers(synced) WHERE synced = 0;
