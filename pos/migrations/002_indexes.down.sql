-- Rollback 002: Drop all indexes from migration 002
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_created_at;
DROP INDEX IF EXISTS idx_orders_shift_id;
DROP INDEX IF EXISTS idx_orders_synced;
DROP INDEX IF EXISTS idx_orders_order_number;
DROP INDEX IF EXISTS idx_order_items_order_id;
DROP INDEX IF EXISTS idx_menu_items_category;
DROP INDEX IF EXISTS idx_shifts_cashier_status;
DROP INDEX IF EXISTS idx_shifts_synced;
DROP INDEX IF EXISTS idx_expenses_shift_id;
DROP INDEX IF EXISTS idx_expenses_synced;
DROP INDEX IF EXISTS idx_day_closings_date;
DROP INDEX IF EXISTS idx_day_closings_synced;
DROP INDEX IF EXISTS idx_cashiers_synced;
