-- Add type column to modifier_groups for local POS SQLite
ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'modifier';
