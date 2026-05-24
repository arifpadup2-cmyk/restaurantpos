-- 046: auto-protect all owner-role inserts via trigger + backfill missed rows

-- Trigger: any new bo_users row with role='owner' auto-gets is_protected=true
CREATE OR REPLACE FUNCTION fn_auto_protect_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'owner' THEN NEW.is_protected = true; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_owner ON bo_users;
CREATE TRIGGER trg_protect_owner
BEFORE INSERT ON bo_users
FOR EACH ROW EXECUTE FUNCTION fn_auto_protect_owner();

-- Backfill any owner-role users that slipped through before this migration
UPDATE bo_users SET is_protected = true WHERE role = 'owner' AND is_protected = false;
