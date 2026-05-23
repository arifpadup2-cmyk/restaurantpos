-- Markets: grouping layer between Brand and Outlet
CREATE TABLE IF NOT EXISTS markets (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  brand_id        TEXT REFERENCES brands(id) ON DELETE SET NULL,
  restaurant_id   TEXT,
  country         TEXT,
  currency_code   TEXT DEFAULT 'USD',
  currency_symbol TEXT DEFAULT '$',
  created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX IF NOT EXISTS idx_markets_brand      ON markets(brand_id)      WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_markets_restaurant ON markets(restaurant_id) WHERE restaurant_id IS NOT NULL;

-- Add market_id to outlets
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS market_id TEXT REFERENCES markets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_outlets_market ON outlets(market_id) WHERE market_id IS NOT NULL;
