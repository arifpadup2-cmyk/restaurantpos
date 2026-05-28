-- Add kitchen_id column to menu_items for per-item kitchen assignment
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS kitchen_id TEXT REFERENCES kitchens(id) ON DELETE SET NULL;
