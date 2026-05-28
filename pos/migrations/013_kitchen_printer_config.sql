-- Add kitchen_id to categories for department-wise KOT routing
ALTER TABLE categories ADD COLUMN IF NOT EXISTS kitchen_id TEXT;
