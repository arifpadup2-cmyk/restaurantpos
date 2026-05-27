-- 051: delivery boy tracking columns on orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_boy_id        TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_boy_name      TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status        TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_assigned_at   BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_picked_up_at  BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_delivered_at  BIGINT;
