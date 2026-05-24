-- Migration 012: Extend printers table for full local storage
-- Adds role (receipt/kot/both), connection_type (windows/network), windows_name, paper_width

ALTER TABLE printers ADD COLUMN IF NOT EXISTS role             TEXT    NOT NULL DEFAULT 'receipt';
ALTER TABLE printers ADD COLUMN IF NOT EXISTS connection_type  TEXT    NOT NULL DEFAULT 'windows';
ALTER TABLE printers ADD COLUMN IF NOT EXISTS windows_name     TEXT;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS paper_width      INTEGER NOT NULL DEFAULT 80;
