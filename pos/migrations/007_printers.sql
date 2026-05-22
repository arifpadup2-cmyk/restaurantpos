-- Migration 007: Network printer registry
-- Stores IP-addressable thermal printers for server-side KOT printing.
-- area: kitchen | counter | bar — used to route KOTs to correct printer.

CREATE TABLE IF NOT EXISTS printers (
  id       TEXT     PRIMARY KEY,
  name     TEXT     NOT NULL,
  type     TEXT     NOT NULL DEFAULT 'epson',  -- epson | star | escpos
  ip       TEXT,
  port     INTEGER           DEFAULT 9100,
  area     TEXT     NOT NULL DEFAULT 'kitchen',
  active   SMALLINT NOT NULL DEFAULT 1
);
