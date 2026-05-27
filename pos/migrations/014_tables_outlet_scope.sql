-- Scope tables_layout to an outlet so multi-outlet shared-DB setups
-- do not bleed tables across outlets.
ALTER TABLE tables_layout ADD COLUMN IF NOT EXISTS outlet_id TEXT;
