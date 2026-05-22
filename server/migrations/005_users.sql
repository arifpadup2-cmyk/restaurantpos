CREATE TABLE IF NOT EXISTS bo_users (
  id          TEXT        PRIMARY KEY,
  username    TEXT        NOT NULL UNIQUE,
  password    TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'admin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
