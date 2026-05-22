-- Extended restaurant fields for provider admin
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reseller_name    TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS last_billed_at   TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS license_given_days INT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS license_key_enc  TEXT;  -- AES-encrypted key for admin display
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS bo_username      TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS bo_password_enc  TEXT;  -- AES-encrypted BO password
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS license_start_at TIMESTAMPTZ;
