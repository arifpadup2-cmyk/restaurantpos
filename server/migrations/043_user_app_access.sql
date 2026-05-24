-- 043: app access flags and designation link for bo_users

ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS app_access     JSONB NOT NULL DEFAULT '{}';
ALTER TABLE bo_users ADD COLUMN IF NOT EXISTS designation_id TEXT  REFERENCES designations(id) ON DELETE SET NULL;

-- Default: existing owner/admin users get full app access
UPDATE bo_users
SET app_access = '{"pos":true,"captain_app":true,"kds":true,"backoffice":true,"owner_app":false}'::jsonb
WHERE app_access = '{}'::jsonb
  AND role IN ('owner','admin');

-- Staff users get backoffice only by default
UPDATE bo_users
SET app_access = '{"pos":false,"captain_app":false,"kds":false,"backoffice":true,"owner_app":false}'::jsonb
WHERE app_access = '{}'::jsonb;
