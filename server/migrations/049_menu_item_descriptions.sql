-- Add short_description and long_description to menu_items for digital menu support
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS long_description   TEXT;
