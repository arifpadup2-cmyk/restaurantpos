-- 033: Rename restaurant_id → brand_id in tables missed by migration 032

BEGIN;

DO $$ BEGIN ALTER TABLE outlet_hidden_payments  RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE outlet_hidden_payments  ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE outlet_hidden_partners   RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE outlet_hidden_partners  ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE pos_button_config        RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE pos_button_config       ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE backup_log               RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE backup_log              ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- Add setup_done column to brands if not exists (used by onboarding flow)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS setup_done BOOLEAN NOT NULL DEFAULT false;

COMMIT;
