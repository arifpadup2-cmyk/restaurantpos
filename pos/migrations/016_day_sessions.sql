CREATE TABLE IF NOT EXISTS day_openings (
  id          TEXT    PRIMARY KEY,
  date        TEXT    NOT NULL,
  outlet_id   TEXT,
  terminal_id TEXT,
  opened_by   TEXT,
  opened_at   BIGINT  NOT NULL,
  closed_by   TEXT,
  closed_at   BIGINT,
  status      TEXT    NOT NULL DEFAULT 'open',
  notes       TEXT,
  synced      SMALLINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_day_openings_date_outlet
  ON day_openings(date, COALESCE(outlet_id,''));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS business_date TEXT;
