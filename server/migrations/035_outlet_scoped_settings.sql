-- 035: Per-outlet settings support
-- Adds outlet_id to settings table so each outlet can override brand-level settings.
-- '' (empty string) outlet_id = brand-wide default (existing rows).
-- non-empty outlet_id = outlet-specific override.
--
-- Read logic: outlet setting ?? brand setting (WHERE outlet_id = '') ?? system default
-- Write logic: pass outlet_id in request to write outlet-specific, omit for brand-wide

BEGIN;

-- Step 1: Add outlet_id column with default '' (brand-wide)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS outlet_id TEXT NOT NULL DEFAULT '';

-- Step 2: Drop old PK (brand_id, key), recreate as (brand_id, outlet_id, key)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings ADD PRIMARY KEY (brand_id, outlet_id, key);

-- Step 3: Index for fast outlet fallback lookups
CREATE INDEX IF NOT EXISTS idx_settings_brand_outlet ON settings(brand_id, outlet_id);

COMMIT;
