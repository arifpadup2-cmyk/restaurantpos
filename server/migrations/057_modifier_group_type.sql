-- Add type column to modifier_groups to distinguish Modifier vs Add-on
ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'modifier';
