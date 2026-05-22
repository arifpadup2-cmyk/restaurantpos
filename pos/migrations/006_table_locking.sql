-- Migration 006: Table locking for multi-terminal conflict prevention
-- locked_by = MACHINE_ID of terminal currently building an order for this table.
-- NULL means no terminal has claimed it.
-- UPDATE ... WHERE locked_by IS NULL OR locked_by = $terminal acts as an atomic lock.

ALTER TABLE tables_layout ADD COLUMN IF NOT EXISTS locked_by TEXT;
