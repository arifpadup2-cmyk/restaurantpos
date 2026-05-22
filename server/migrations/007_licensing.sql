-- Restaurant registrations + terminal tracking
CREATE TABLE IF NOT EXISTS restaurants (
  id               TEXT        PRIMARY KEY,           -- REST-XXXXXX
  name             TEXT        NOT NULL,
  license_key_hash TEXT        NOT NULL,              -- bcrypt hash
  license_prefix   TEXT        NOT NULL DEFAULT '',   -- first 4 chars for display
  max_terminals    INT         NOT NULL DEFAULT 10,
  expires_at       TIMESTAMPTZ,
  active           BOOLEAN     NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS terminal_registrations (
  id            TEXT        PRIMARY KEY,
  restaurant_id TEXT        NOT NULL REFERENCES restaurants(id),
  machine_id    TEXT        NOT NULL,
  last_seen     TIMESTAMPTZ,
  active        BOOLEAN     NOT NULL DEFAULT true,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_terminals_restaurant ON terminal_registrations(restaurant_id);

-- Auto-backup log
CREATE TABLE IF NOT EXISTS backup_log (
  id         TEXT        PRIMARY KEY,
  filename   TEXT        NOT NULL,
  size_bytes BIGINT      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
