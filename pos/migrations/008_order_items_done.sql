-- Migration 008: KDS item-level completion tracking
-- done = true when kitchen has prepared this item.
-- Allows KDS to mark items individually before closing full order.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_order_items_done ON order_items(done) WHERE done = false;
