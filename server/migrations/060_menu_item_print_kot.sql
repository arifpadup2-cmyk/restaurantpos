-- Per-item KOT control: some items (e.g. retail, pre-packed) don't need a
-- kitchen ticket. Default = 1 (print KOT). Set to 0 to skip KOT for that item.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS print_kot SMALLINT NOT NULL DEFAULT 1;
