-- 040: Refresh-token table for BO session management
-- Replaces 4-hour-only access-token flow with access (15 min) + refresh (30 d).

BEGIN;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  brand_id    TEXT,
  token_hash  TEXT        NOT NULL,
  user_agent  TEXT,
  ip          TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_brand   ON refresh_tokens(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

COMMIT;
