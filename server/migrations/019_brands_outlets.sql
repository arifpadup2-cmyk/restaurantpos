-- Brands table (multiple brands per restaurant/owner account)
CREATE TABLE IF NOT EXISTS brands (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  logo_url      TEXT,
  business_type TEXT,
  country       TEXT DEFAULT 'MY',
  owner_name    TEXT,
  created_at    BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Outlets table (multiple outlets per account, each linked to a brand)
CREATE TABLE IF NOT EXISTS outlets (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  brand_id      TEXT,
  name          TEXT NOT NULL DEFAULT 'Main Outlet',
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  opening_time  TEXT DEFAULT '09:00',
  closing_time  TEXT DEFAULT '22:00',
  currency      TEXT DEFAULT 'MYR',
  created_at    BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Seed first brand from existing restaurant data (skip if already seeded)
INSERT INTO brands (id, restaurant_id, name, logo_url, business_type, country, owner_name, created_at)
SELECT
  'brand-' || id,
  id,
  COALESCE(NULLIF(brand_name, ''), NULLIF(name, ''), 'My Brand'),
  logo_url,
  business_type,
  COALESCE(NULLIF(country, ''), 'MY'),
  owner_name,
  EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
FROM restaurants
WHERE NOT EXISTS (SELECT 1 FROM brands WHERE restaurant_id = restaurants.id)
ON CONFLICT (id) DO NOTHING;

-- Seed first outlet from existing settings data (skip if already seeded)
INSERT INTO outlets (id, restaurant_id, brand_id, name, phone, email, address, opening_time, closing_time, currency, created_at)
SELECT
  'outlet-' || r.id,
  r.id,
  'brand-' || r.id,
  COALESCE(MAX(CASE WHEN s.key = 'branch_name' THEN NULLIF(s.value,'') END), 'Main Outlet'),
  MAX(CASE WHEN s.key = 'outlet_phone' THEN s.value END),
  MAX(CASE WHEN s.key = 'outlet_email' THEN s.value END),
  MAX(CASE WHEN s.key = 'address'      THEN s.value END),
  COALESCE(MAX(CASE WHEN s.key = 'opening_time' THEN s.value END), '09:00'),
  COALESCE(MAX(CASE WHEN s.key = 'closing_time' THEN s.value END), '22:00'),
  COALESCE(MAX(CASE WHEN s.key = 'currency'     THEN s.value END), 'MYR'),
  EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
FROM restaurants r
LEFT JOIN settings s ON s.restaurant_id = r.id
  AND s.key IN ('branch_name','outlet_phone','outlet_email','address','opening_time','closing_time','currency')
WHERE NOT EXISTS (SELECT 1 FROM outlets WHERE restaurant_id = r.id)
GROUP BY r.id
ON CONFLICT (id) DO NOTHING;
