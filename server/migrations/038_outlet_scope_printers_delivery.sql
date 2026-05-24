-- 038: Outlet-scope printers + delivery_partners
-- NULL outlet_id means brand-wide (visible to all outlets).

BEGIN;

-- printers: restaurant_id → brand_id (missed by 032 and 033)
DO $$ BEGIN ALTER TABLE printers RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS brand_id TEXT;

ALTER TABLE printers          ADD COLUMN IF NOT EXISTS outlet_id TEXT;
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS outlet_id TEXT;

CREATE INDEX IF NOT EXISTS idx_printers_brand_outlet
  ON printers(brand_id, outlet_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_partners_brand_outlet
  ON delivery_partners(brand_id, outlet_id) WHERE brand_id IS NOT NULL;

COMMIT;
