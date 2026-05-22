-- Tax Groups
CREATE TABLE IF NOT EXISTS tax_groups (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  rate NUMERIC DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at BIGINT
);

-- Payment Methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'other',
  enabled BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- Delivery Partners
CREATE TABLE IF NOT EXISTS delivery_partners (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  commission_rate NUMERIC DEFAULT 0
);

-- Order Types
CREATE TABLE IF NOT EXISTS order_types (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  icon TEXT DEFAULT '',
  sort_order INT DEFAULT 0
);

-- Kitchens
CREATE TABLE IF NOT EXISTS kitchens (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  enabled BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- Designations
CREATE TABLE IF NOT EXISTS designations (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  access_level INT DEFAULT 1,
  permissions JSONB DEFAULT '{}'::jsonb
);

-- Add business_type and logo_url to restaurants if missing
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS logo_url TEXT;
