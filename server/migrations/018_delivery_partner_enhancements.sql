-- Add logo_url to delivery_partners
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add delivery_partner_id to orders so we can track which partner handled each order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_partner_id TEXT;
