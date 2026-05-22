-- Make settings per-restaurant
ALTER TABLE settings ADD COLUMN IF NOT EXISTS restaurant_id TEXT NOT NULL DEFAULT '';

-- Drop old single-column PK and replace with composite (restaurant_id, key)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings ADD PRIMARY KEY (restaurant_id, key);
