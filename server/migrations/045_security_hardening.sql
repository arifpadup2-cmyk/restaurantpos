-- 045: account lockout, login audit log, owner security metadata

-- Account lockout on backoffice users
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS locked_until    BIGINT;

-- Owner portal security metadata
ALTER TABLE owners ADD COLUMN IF NOT EXISTS last_login_at   BIGINT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS login_count     INT NOT NULL DEFAULT 0;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS locked_until    BIGINT;

-- Login audit log (both bo_users and owners)
CREATE TABLE IF NOT EXISTS login_audit_log (
  id         TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_type  TEXT    NOT NULL,   -- 'bo_user' | 'owner'
  user_id    TEXT,
  username   TEXT,
  brand_id   TEXT,
  success    BOOLEAN NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at BIGINT  NOT NULL DEFAULT (EXTRACT(EPOCH FROM now())::BIGINT * 1000)
);
CREATE INDEX IF NOT EXISTS idx_login_audit_user ON login_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_audit_ip   ON login_audit_log(ip, created_at DESC);
