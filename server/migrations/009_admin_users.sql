CREATE TABLE IF NOT EXISTS admin_users (
  id          TEXT        PRIMARY KEY,
  username    TEXT        UNIQUE NOT NULL,
  password    TEXT        NOT NULL,
  name        TEXT,
  role        TEXT        NOT NULL DEFAULT 'superadmin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
