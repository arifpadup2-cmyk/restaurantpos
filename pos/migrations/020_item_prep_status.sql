-- Mirror of server/migrations/063: per-item kitchen status (pending → preparing → ready).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS prep_status TEXT NOT NULL DEFAULT 'pending';
UPDATE order_items SET prep_status = 'ready' WHERE done = true AND prep_status = 'pending';
