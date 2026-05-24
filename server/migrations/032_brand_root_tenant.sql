-- 032: Brand as root tenant — replaces restaurants table
-- Wipes all user data, elevates brands to root tenant, renames restaurant_id → brand_id

BEGIN;

-- ── 1. WIPE ALL DATA ─────────────────────────────────────────────────────────
-- Order matters: child tables first (FK constraints)
TRUNCATE TABLE
  item_modifier_groups,
  modifier_options,
  modifier_groups,
  item_variants,
  order_items,
  orders,
  expenses,
  shifts,
  day_closings,
  audit_log,
  no_sale_log,
  customers,
  tables_layout,
  table_sections,
  menu_items,
  categories,
  cashiers,
  settings,
  tax_groups,
  payment_methods,
  delivery_partners,
  order_types,
  kitchens,
  designations,
  terminal_registrations,
  outlets,
  markets,
  brands,
  bo_users,
  backup_log
CASCADE;

-- ── 2. ELEVATE brands TO ROOT TENANT ────────────────────────────────────────
-- Absorb all fields from restaurants into brands

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS license_key_hash TEXT,
  ADD COLUMN IF NOT EXISTS license_prefix   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS max_terminals    INT  NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS plan             TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS email            TEXT,
  ADD COLUMN IF NOT EXISTS phone            TEXT,
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_step  INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_source    TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS reseller         TEXT,
  ADD COLUMN IF NOT EXISTS bo_username      TEXT,
  ADD COLUMN IF NOT EXISTS bo_password_enc  TEXT,
  ADD COLUMN IF NOT EXISTS license_key_enc  TEXT,
  ADD COLUMN IF NOT EXISTS last_billed_at   TIMESTAMPTZ;

-- Drop the restaurant_id FK from brands (brands is now root)
ALTER TABLE brands DROP COLUMN IF EXISTS restaurant_id;

-- ── 3. UPDATE markets — remove restaurant_id, keep brand_id ─────────────────
ALTER TABLE markets DROP COLUMN IF EXISTS restaurant_id;
-- Ensure brand_id FK is correct
ALTER TABLE markets DROP CONSTRAINT IF EXISTS markets_brand_id_fkey;
ALTER TABLE markets
  ADD CONSTRAINT markets_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;

-- ── 4. UPDATE outlets — remove restaurant_id ─────────────────────────────────
ALTER TABLE outlets DROP COLUMN IF EXISTS restaurant_id;
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_brand_id_fkey;
ALTER TABLE outlets
  ADD CONSTRAINT outlets_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;

-- ── 5. RENAME restaurant_id → brand_id in all scoped tables ─────────────────

-- bo_users
DO $$ BEGIN ALTER TABLE bo_users RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- settings (composite PK: restaurant_id, key)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
DO $$ BEGIN ALTER TABLE settings RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD PRIMARY KEY (brand_id, key);

-- orders
DO $$ BEGIN ALTER TABLE orders RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- categories
DO $$ BEGIN ALTER TABLE categories RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- menu_items
DO $$ BEGIN ALTER TABLE menu_items RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- tables_layout
DO $$ BEGIN ALTER TABLE tables_layout RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE tables_layout ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- table_sections
DO $$ BEGIN ALTER TABLE table_sections RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE table_sections ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- cashiers
DO $$ BEGIN ALTER TABLE cashiers RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- expenses
DO $$ BEGIN ALTER TABLE expenses RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- shifts
DO $$ BEGIN ALTER TABLE shifts RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- day_closings
DO $$ BEGIN ALTER TABLE day_closings RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE day_closings ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- config tables
DO $$ BEGIN ALTER TABLE tax_groups RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE tax_groups ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE payment_methods RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE delivery_partners RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE order_types RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE order_types ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE kitchens RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE designations RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE designations ADD COLUMN IF NOT EXISTS brand_id TEXT;

DO $$ BEGIN ALTER TABLE modifier_groups RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- terminal_registrations
DO $$ BEGIN ALTER TABLE terminal_registrations RENAME COLUMN restaurant_id TO brand_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE terminal_registrations ADD COLUMN IF NOT EXISTS brand_id TEXT;
ALTER TABLE terminal_registrations DROP CONSTRAINT IF EXISTS terminal_registrations_restaurant_id_fkey;
ALTER TABLE terminal_registrations DROP CONSTRAINT IF EXISTS terminal_registrations_brand_id_fkey;
ALTER TABLE terminal_registrations
  ADD CONSTRAINT terminal_registrations_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;

-- audit_log: add brand_id if not present
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS brand_id TEXT;
ALTER TABLE no_sale_log ADD COLUMN IF NOT EXISTS brand_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS brand_id TEXT;

-- ── 6. DROP restaurants TABLE ────────────────────────────────────────────────
DROP TABLE IF EXISTS restaurants CASCADE;

-- ── 7. RECREATE INDEXES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bo_users_brand    ON bo_users(brand_id)    WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_brand      ON orders(brand_id)      WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_brand  ON categories(brand_id)  WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_brand  ON menu_items(brand_id)  WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tables_brand      ON tables_layout(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashiers_brand    ON cashiers(brand_id)    WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_brand    ON expenses(brand_id)    WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_brand      ON shifts(brand_id)      WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outlets_brand     ON outlets(brand_id)     WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_markets_brand_v2  ON markets(brand_id)     WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_brand   ON audit_log(brand_id)   WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_brand   ON customers(brand_id)   WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_terminals_brand   ON terminal_registrations(brand_id) WHERE brand_id IS NOT NULL;

COMMIT;
