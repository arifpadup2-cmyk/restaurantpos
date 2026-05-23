-- Global payment methods (managed by super admin only)
CREATE TABLE IF NOT EXISTS global_payment_methods (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '💳',
  type       TEXT DEFAULT 'other',
  active     BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Global delivery partners (managed by super admin only)
CREATE TABLE IF NOT EXISTS global_delivery_partners (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  logo_url       TEXT,
  commission_pct NUMERIC(5,2) DEFAULT 0,
  active         BOOLEAN DEFAULT true,
  sort_order     INT DEFAULT 0,
  created_at     BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Outlets that have HIDDEN a global payment method (default = visible)
CREATE TABLE IF NOT EXISTS outlet_hidden_payments (
  restaurant_id TEXT NOT NULL,
  method_id     TEXT NOT NULL,
  created_at    BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  PRIMARY KEY (restaurant_id, method_id)
);

-- Outlets that have HIDDEN a global delivery partner (default = visible)
CREATE TABLE IF NOT EXISTS outlet_hidden_partners (
  restaurant_id TEXT NOT NULL,
  partner_id    TEXT NOT NULL,
  created_at    BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  PRIMARY KEY (restaurant_id, partner_id)
);

-- Seed default global payment methods
INSERT INTO global_payment_methods (id, name, icon, type, sort_order) VALUES
  ('gpm-cash',    'Cash',                '💵', 'cash',    0),
  ('gpm-card',    'Credit / Debit Card', '💳', 'card',    1),
  ('gpm-ewallet', 'e-Wallet',            '📱', 'ewallet', 2),
  ('gpm-qr',      'QR Payment',          '📲', 'qr',      3),
  ('gpm-bank',    'Bank Transfer',       '🏦', 'bank',    4),
  ('gpm-voucher', 'Voucher',             '🎟️', 'voucher', 5)
ON CONFLICT (id) DO NOTHING;

-- Seed default global delivery partners
INSERT INTO global_delivery_partners (id, name, commission_pct, sort_order) VALUES
  ('gdp-grabfood',  'GrabFood',     30, 0),
  ('gdp-foodpanda', 'foodpanda',    30, 1),
  ('gdp-shopee',    'ShopeeFood',   25, 2),
  ('gdp-airasia',   'AirAsia Food', 30, 3),
  ('gdp-talabat',   'Talabat',      30, 4),
  ('gdp-deliveroo', 'Deliveroo',    30, 5),
  ('gdp-lalamove',  'Lalamove',     20, 6),
  ('gdp-own',       'Own Delivery',  0, 7)
ON CONFLICT (id) DO NOTHING;
