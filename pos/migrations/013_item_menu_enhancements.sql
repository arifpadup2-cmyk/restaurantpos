-- Migration 013: Extend order_items with variant and modifier data
-- Also backfills missing extended columns on menu_items for POS queries

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id    TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name  TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers     TEXT; -- JSON array of {name, price} objects
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS comp          SMALLINT NOT NULL DEFAULT 0;

-- Ensure extended menu item columns exist (migration 026 ran server-side but
-- item_code was missing from the original POS schema)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_code         TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sub_category      TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url         TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_type         TEXT DEFAULT 'single';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS preparation_time  INT  DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tax_group_id      TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS barcode           TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS kitchen_name      TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS internal_note     TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS printer_group     TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tags              TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS dine_in_price     NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS takeaway_price    NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS delivery_price    NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_price      NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS dine_in_active    BOOLEAN DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS takeaway_active   BOOLEAN DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS delivery_active   BOOLEAN DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_active     BOOLEAN DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS brand_id          TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS outlet_id         TEXT;

-- Ensure item_variants exists (created by migration 026 server-side)
CREATE TABLE IF NOT EXISTS item_variants (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  size       TEXT DEFAULT '',
  price      NUMERIC NOT NULL DEFAULT 0,
  active     BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- Ensure modifier tables exist
CREATE TABLE IF NOT EXISTS modifier_groups (
  id          TEXT PRIMARY KEY,
  brand_id    TEXT,
  restaurant_id TEXT,
  name        TEXT NOT NULL,
  min_select  INT DEFAULT 0,
  max_select  INT DEFAULT 1,
  required    BOOLEAN DEFAULT false,
  created_at  BIGINT
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  price      NUMERIC DEFAULT 0,
  active     BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_modifier_groups (
  item_id  TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (item_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_item_variants_item    ON item_variants(item_id);
CREATE INDEX IF NOT EXISTS idx_item_mod_groups_item  ON item_modifier_groups(item_id);
CREATE INDEX IF NOT EXISTS idx_modifier_opts_group   ON modifier_options(group_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order     ON order_items(order_id);
