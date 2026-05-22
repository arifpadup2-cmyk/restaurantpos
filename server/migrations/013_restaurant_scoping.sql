-- Add restaurant_id to POS data tables so data can be scoped and deleted per restaurant
ALTER TABLE cashiers      ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE categories    ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE menu_items    ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE tables_layout ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE customers     ADD COLUMN IF NOT EXISTS restaurant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cashiers_rid      ON cashiers(restaurant_id)      WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_rid    ON categories(restaurant_id)    WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_rid    ON menu_items(restaurant_id)    WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tables_layout_rid ON tables_layout(restaurant_id) WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_rid     ON customers(restaurant_id)     WHERE restaurant_id IS NOT NULL;
