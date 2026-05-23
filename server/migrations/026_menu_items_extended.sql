-- Extend menu_items with rich item fields
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sub_category TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'single';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS preparation_time INT DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tax_group_id TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS kitchen_name TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS printer_group TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tags TEXT;
-- Per-channel price overrides (NULL = use base price)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS dine_in_price NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS takeaway_price NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS delivery_price NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_price NUMERIC;
-- Per-channel availability
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS dine_in_active BOOLEAN DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS takeaway_active BOOLEAN DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS delivery_active BOOLEAN DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_active BOOLEAN DEFAULT true;

-- Item Variants (size options, e.g. Small/Medium/Large)
CREATE TABLE IF NOT EXISTS item_variants (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size TEXT DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- Modifier Groups (e.g. "Spice Level", "Add-ons")
CREATE TABLE IF NOT EXISTS modifier_groups (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  min_select INT DEFAULT 0,
  max_select INT DEFAULT 1,
  required BOOLEAN DEFAULT false,
  created_at BIGINT
);

-- Options within a modifier group
CREATE TABLE IF NOT EXISTS modifier_options (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- Junction: which modifier groups are linked to which menu items
CREATE TABLE IF NOT EXISTS item_modifier_groups (
  item_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (item_id, group_id)
);
