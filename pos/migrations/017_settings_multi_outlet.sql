-- Migration 017: Fix settings table to support multi-outlet/multi-brand configuration
-- The settings table was defined with only a single-column PK (key),
-- but main.js seeds it with composite PK expectations (brand_id, outlet_id, key).
-- This migration adds the missing columns and fixes the PK constraint.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_id  TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS outlet_id TEXT NOT NULL DEFAULT '';

-- Migrate existing rows to composite PK
UPDATE settings SET brand_id = '' WHERE brand_id IS NULL;
UPDATE settings SET outlet_id = '' WHERE outlet_id IS NULL;

-- Drop old single-column PK constraint
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;

-- Add correct composite PK
ALTER TABLE settings ADD PRIMARY KEY (brand_id, outlet_id, key);
