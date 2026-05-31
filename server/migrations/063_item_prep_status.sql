-- Per-item kitchen status for the KDS: pending → preparing → ready.
-- `done` is kept in sync (done ⇔ prep_status='ready') for backward compatibility
-- with the Live Orders board and existing mark-done flow.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS prep_status TEXT NOT NULL DEFAULT 'pending';

-- Backfill: anything already marked done is 'ready'.
UPDATE order_items SET prep_status = 'ready' WHERE done = true AND prep_status = 'pending';
