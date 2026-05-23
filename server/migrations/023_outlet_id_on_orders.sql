-- Add outlet_id to orders for per-outlet reporting/filtering
ALTER TABLE orders ADD COLUMN IF NOT EXISTS outlet_id TEXT;

-- Index for report filtering
CREATE INDEX IF NOT EXISTS idx_orders_outlet_id ON orders(outlet_id) WHERE outlet_id IS NOT NULL;
