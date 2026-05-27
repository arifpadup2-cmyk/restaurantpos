-- Add seat tracking and section grouping for tables
ALTER TABLE tables_layout ADD COLUMN IF NOT EXISTS seat_count INTEGER;
ALTER TABLE tables_layout ADD COLUMN IF NOT EXISTS section_name TEXT;

-- Add aggregator order ID and section name to orders for richer order cards
ALTER TABLE orders ADD COLUMN IF NOT EXISTS aggregator_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS section_name TEXT;
