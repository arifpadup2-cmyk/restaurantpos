-- Table sections (group tables into areas like Indoor, Outdoor, VIP)
CREATE TABLE IF NOT EXISTS table_sections (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  sort_order    INT DEFAULT 0,
  created_at    BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Add section reference to tables_layout
ALTER TABLE tables_layout ADD COLUMN IF NOT EXISTS section_id TEXT REFERENCES table_sections(id) ON DELETE SET NULL;

-- Add per-outlet country and currency fields
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS country       TEXT DEFAULT 'MY';
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'MYR';
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT 'RM';
