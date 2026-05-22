-- Support Google Sign-In for Back Office users
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS restaurant_id TEXT REFERENCES restaurants(id);
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS google_id     TEXT UNIQUE;
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS email         TEXT;

CREATE INDEX IF NOT EXISTS idx_bo_users_google ON bo_users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bo_users_email  ON bo_users(email)     WHERE email     IS NOT NULL;
