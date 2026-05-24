-- 038: Outlet-scope printers + delivery_partners
-- NULL outlet_id means brand-wide (visible to all outlets).

BEGIN;

ALTER TABLE printers          ADD COLUMN IF NOT EXISTS outlet_id TEXT;
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS outlet_id TEXT;

CREATE INDEX IF NOT EXISTS idx_printers_brand_outlet
  ON printers(brand_id, outlet_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_partners_brand_outlet
  ON delivery_partners(brand_id, outlet_id) WHERE brand_id IS NOT NULL;

COMMIT;
