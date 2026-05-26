-- Migration 047: Add variant, modifier, done, and comp columns to order_items
-- Enables variant/modifier tracking in orders and KDS done-state

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id    TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name  TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers     TEXT; -- JSON array [{id,name,price}]
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS comp          SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS done          BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_order_items_item_id ON order_items(item_id);
