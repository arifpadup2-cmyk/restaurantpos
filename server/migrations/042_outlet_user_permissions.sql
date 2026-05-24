-- 042: outlet-level user permissions + display name for bo_users

ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS name        TEXT;
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS outlet_ids  TEXT[];   -- NULL = all outlets for the brand
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}';

-- Default permissions object for existing admin users: full access
UPDATE bo_users
SET permissions = '{
  "view_reports": true,
  "view_sales_invoice": true,
  "view_expenses": true,
  "view_cashier_report": true,
  "view_voids": true,
  "view_audit": true,
  "manage_menu": true,
  "manage_config": true,
  "manage_users": true
}'::jsonb
WHERE permissions = '{}'::jsonb;
