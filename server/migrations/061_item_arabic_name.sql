-- Arabic name for menu items (shown on Arabic-capable bill/KOT designs).
ALTER TABLE menu_items  ADD COLUMN IF NOT EXISTS name_ar      TEXT;
-- Snapshot of the Arabic name on the order line (so reprints keep it).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_name_ar TEXT;
