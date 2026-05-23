-- Add outlet-level license date
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS license_end_date TIMESTAMPTZ;

-- Track which outlet each terminal is linked to
ALTER TABLE terminal_registrations ADD COLUMN IF NOT EXISTS outlet_id TEXT;
