-- 044: owner protection, login tracking, POS PIN, user-management audit log

-- Protect owner accounts from modification by other users
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS is_protected  BOOLEAN NOT NULL DEFAULT false;
UPDATE bo_users SET is_protected = true WHERE role = 'owner';

-- Track who created each user
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS created_by    TEXT REFERENCES bo_users(id) ON DELETE SET NULL;

-- Login tracking
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS last_login_at BIGINT;
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS login_count   INT NOT NULL DEFAULT 0;

-- POS PIN (short numeric PIN for POS terminal, separate from backoffice password)
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS pos_pin       TEXT;

-- User-management audit log (separate from POS operations audit_log)
CREATE TABLE IF NOT EXISTS bo_user_audit_log (
  id          TEXT   PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id    TEXT   NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT,
  action      TEXT   NOT NULL,
  target_id   TEXT,
  target_name TEXT,
  changes     JSONB,
  ip          TEXT,
  created_at  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now())::BIGINT * 1000)
);
CREATE INDEX IF NOT EXISTS idx_bo_user_audit_brand ON bo_user_audit_log(brand_id, created_at DESC);
