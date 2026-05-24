-- 037: SaaS public-signup hardening
-- - Adds WhatsApp, email-verification fields to brands
-- - Drops reversible password / license storage (defense-in-depth)
-- - Adds per-terminal API-key hash to terminal_registrations
-- - Adds market_id NOT-VALID FK on outlets (enforced for new rows)

BEGIN;

-- ── brands: missing SaaS fields ──────────────────────────────────────────────
ALTER TABLE brands ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS email_verified  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS email_verification_token   TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS onboarding_token TEXT;            -- HMAC-signed token for public onboarding URL
CREATE INDEX IF NOT EXISTS idx_brands_email          ON brands(LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brands_verify_token   ON brands(email_verification_token) WHERE email_verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brands_onboarding_tok ON brands(onboarding_token) WHERE onboarding_token IS NOT NULL;

-- Drop reversible password / license columns (replaced by one-time-show on signup)
ALTER TABLE brands DROP COLUMN IF EXISTS bo_password_enc;
ALTER TABLE brands DROP COLUMN IF EXISTS license_key_enc;

-- ── bo_users: add email + google_id (some may already exist from 012) ────────
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS email     TEXT;
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS google_id TEXT;
CREATE INDEX IF NOT EXISTS idx_bo_users_email     ON bo_users(LOWER(email))   WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bo_users_google_id ON bo_users(google_id)      WHERE google_id IS NOT NULL;

-- ── terminal_registrations: per-terminal API key ─────────────────────────────
ALTER TABLE terminal_registrations ADD COLUMN IF NOT EXISTS api_key_hash   TEXT;   -- bcrypt
ALTER TABLE terminal_registrations ADD COLUMN IF NOT EXISTS api_key_prefix TEXT;   -- first 8 chars for display/lookup
ALTER TABLE terminal_registrations ADD COLUMN IF NOT EXISTS revoked_at     TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_terminals_api_prefix ON terminal_registrations(api_key_prefix) WHERE api_key_prefix IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_terminals_outlet     ON terminal_registrations(outlet_id)      WHERE outlet_id IS NOT NULL;

-- ── outlets: enforce market_id going forward (NOT VALID = skip existing rows) ─
-- Existing rows may have NULL market_id; CHECK marked NOT VALID so legacy data
-- does not break this migration. New rows must satisfy the constraint.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outlets_market_id_not_null_chk'
  ) THEN
    ALTER TABLE outlets
      ADD CONSTRAINT outlets_market_id_not_null_chk CHECK (market_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

COMMIT;
