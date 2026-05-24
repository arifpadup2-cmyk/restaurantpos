-- 039: Defense-in-depth tenant constraints
-- Ensures every row whose outlet_id is set has a brand_id matching that outlet.
-- Uses NOT VALID so existing rows don't block deployment; new inserts validated.
--
-- NOTE: full Postgres RLS is planned but requires deployment-role separation
-- (non-superuser application role + SET LOCAL app.brand_id per request).
-- See docs/RLS.md (future). For now we enforce at the constraint layer.

BEGIN;

-- ── outlets must have brand_id ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='outlets_brand_id_not_null_chk') THEN
    ALTER TABLE outlets ADD CONSTRAINT outlets_brand_id_not_null_chk
      CHECK (brand_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- ── markets must have brand_id ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='markets_brand_id_not_null_chk') THEN
    ALTER TABLE markets ADD CONSTRAINT markets_brand_id_not_null_chk
      CHECK (brand_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- ── orders.brand_id NOT NULL (legacy rows backfilled by 036) ─────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_brand_id_not_null_chk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_brand_id_not_null_chk
      CHECK (brand_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- ── menu_items, categories, cashiers, tables_layout: brand_id required for new rows ─
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='menu_items_brand_id_not_null_chk') THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_brand_id_not_null_chk
      CHECK (brand_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='categories_brand_id_not_null_chk') THEN
    ALTER TABLE categories ADD CONSTRAINT categories_brand_id_not_null_chk
      CHECK (brand_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cashiers_brand_id_not_null_chk') THEN
    ALTER TABLE cashiers ADD CONSTRAINT cashiers_brand_id_not_null_chk
      CHECK (brand_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tables_layout_brand_id_not_null_chk') THEN
    ALTER TABLE tables_layout ADD CONSTRAINT tables_layout_brand_id_not_null_chk
      CHECK (brand_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- ── Per-brand uniqueness for menu/category names (avoid global collisions) ──
-- Skipped: existing dataset may have duplicates. Document for future migration.

COMMIT;
