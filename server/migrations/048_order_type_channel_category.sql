-- Add channel_category to order_types for reporting segmentation
ALTER TABLE order_types
  ADD COLUMN IF NOT EXISTS channel_category TEXT NOT NULL DEFAULT 'offline'
  CHECK (channel_category IN ('offline','online','aggregator','other'));

-- Add partner_prices JSON to menu_items for per-delivery-partner pricing
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS partner_prices JSONB NOT NULL DEFAULT '{}';
