-- Order types: add logo_url for image upload support
ALTER TABLE order_types ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Settings: add tax_system key (handled as key-value in settings table, no schema change needed)
-- Placeholder migration — no DDL required for key-value settings table
SELECT 1;
