-- Outlet-level scoping for per-outlet config tables
ALTER TABLE tables_layout   ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE order_types     ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE kitchens        ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE designations    ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE tax_groups      ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE cashiers        ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE menu_items      ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tables_layout_outlet    ON tables_layout(outlet_id)    WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_types_outlet      ON order_types(outlet_id)      WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_methods_outlet  ON payment_methods(outlet_id)  WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kitchens_outlet         ON kitchens(outlet_id)         WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_designations_outlet     ON designations(outlet_id)     WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tax_groups_outlet       ON tax_groups(outlet_id)       WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashiers_outlet         ON cashiers(outlet_id)         WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_categories_outlet  ON menu_categories(outlet_id)  WHERE outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_outlet       ON menu_items(outlet_id)       WHERE outlet_id IS NOT NULL;
