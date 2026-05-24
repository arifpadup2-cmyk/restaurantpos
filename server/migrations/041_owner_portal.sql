-- 041: Owner portal — multi-brand owner accounts
-- An owner can own N brands and sees a consolidated dashboard.
-- This is separate from bo_users (which are brand-scoped staff/admin).

BEGIN;

CREATE TABLE IF NOT EXISTS owners (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  username     TEXT        NOT NULL UNIQUE,
  password     TEXT        NOT NULL,    -- bcrypt hash
  email        TEXT,
  active       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_brands (
  owner_id   TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  brand_id   TEXT NOT NULL,
  PRIMARY KEY (owner_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_brands_owner ON owner_brands(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_brands_brand ON owner_brands(brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_username ON owners(LOWER(username));

COMMIT;
