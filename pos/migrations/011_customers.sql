-- Migration 011: Customer index (table created in 010)
-- Intentionally minimal — customers table is in 010_enhancements
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
