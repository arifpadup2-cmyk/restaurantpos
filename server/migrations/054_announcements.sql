CREATE TABLE IF NOT EXISTS announcements (
  id           TEXT        PRIMARY KEY,
  title        TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  badge_text   TEXT        NOT NULL DEFAULT 'New',
  accent_color TEXT        NOT NULL DEFAULT '#f97316',
  sort_order   INT         NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
