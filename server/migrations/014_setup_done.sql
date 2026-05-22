ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS setup_done BOOLEAN DEFAULT false;
-- All existing restaurants are already set up
UPDATE restaurants SET setup_done = true WHERE setup_done IS DISTINCT FROM true;
