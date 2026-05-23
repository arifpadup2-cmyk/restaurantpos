-- Active flag for BO users (enables session revocation)
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Bcrypt PIN hash for cashiers (plain-text PIN migration happens on server startup)
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Restaurant scoping for previously unscoped tables
ALTER TABLE expenses    ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE audit_log   ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE no_sale_log ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE shifts      ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE day_closings ADD COLUMN IF NOT EXISTS restaurant_id TEXT;
ALTER TABLE printers    ADD COLUMN IF NOT EXISTS restaurant_id TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_rid    ON expenses(restaurant_id)    WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_rid      ON shifts(restaurant_id)      WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_day_closings_rid ON day_closings(restaurant_id) WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_printers_rid    ON printers(restaurant_id)    WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_rid       ON audit_log(restaurant_id)   WHERE restaurant_id IS NOT NULL;
