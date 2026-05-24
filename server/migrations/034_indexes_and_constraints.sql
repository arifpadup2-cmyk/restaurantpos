-- 034: Performance indexes, FK constraints, outlet_id on expenses

BEGIN;

-- ── outlet_id column on expenses (backfill from order terminal→outlet if possible) ──
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS outlet_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS brand_id  TEXT;

-- ── outlet_id column on shifts and day_closings ──────────────────────────────
ALTER TABLE shifts      ADD COLUMN IF NOT EXISTS outlet_id TEXT;
ALTER TABLE day_closings ADD COLUMN IF NOT EXISTS outlet_id TEXT;

-- ── Performance indexes: outlet_id on hot tables ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_outlet      ON orders(outlet_id)       WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_outlet    ON expenses(outlet_id)     WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_brand     ON expenses(brand_id)      WHERE brand_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_outlet      ON shifts(outlet_id)       WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_day_closings_outlet ON day_closings(outlet_id) WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_brand_date  ON orders(brand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_outlet_date ON orders(outlet_id, created_at) WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_brand_date ON expenses(brand_id, created_at) WHERE brand_id IS NOT NULL;

-- ── FK: outlets.market_id → markets.id (ON DELETE SET NULL) ──────────────────
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_market_id_fkey;
ALTER TABLE outlets
  ADD CONSTRAINT outlets_market_id_fkey
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL;

-- ── outlet_id column on table_sections ───────────────────────────────────────
ALTER TABLE table_sections ADD COLUMN IF NOT EXISTS outlet_id TEXT;
CREATE INDEX IF NOT EXISTS idx_table_sections_outlet ON table_sections(outlet_id) WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tables_outlet         ON tables_layout(outlet_id)  WHERE outlet_id IS NOT NULL;

-- ── pos_button_config: rename restaurant_id → brand_id (missed in 032) ───────
DO $$ BEGIN ALTER TABLE pos_button_config RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE pos_button_config ADD COLUMN IF NOT EXISTS brand_id TEXT;
ALTER TABLE pos_button_config DROP CONSTRAINT IF EXISTS pos_button_config_restaurant_id_button_key_key;

-- ── outlet_id column on pos_button_config ────────────────────────────────────
ALTER TABLE pos_button_config ADD COLUMN IF NOT EXISTS outlet_id TEXT;
-- Drop old PK, re-create with outlet_id support
ALTER TABLE pos_button_config DROP CONSTRAINT IF EXISTS pos_button_config_pkey;
ALTER TABLE pos_button_config DROP CONSTRAINT IF EXISTS pos_button_config_brand_id_button_key_key;
-- Unique per (brand_id, outlet_id, button_key): NULL outlet_id = brand-wide default
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_buttons_scope
  ON pos_button_config(brand_id, COALESCE(outlet_id, ''), button_key);

-- ── outlet_id on customers ───────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS outlet_id TEXT;

COMMIT;
