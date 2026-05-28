-- Regenerate all outlet codes with the new case-sensitive charset
-- that includes uppercase, lowercase, digits, and special characters.
-- Run this after 052_outlet_code.sql has already created the column.

DO $$
DECLARE
  r       RECORD;
  code    TEXT;
  chars   TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
  taken   BOOLEAN;
  attempt INT;
BEGIN
  FOR r IN SELECT id FROM outlets LOOP
    attempt := 0;
    LOOP
      code := '';
      FOR i IN 1..6 LOOP
        code := code || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
      END LOOP;
      SELECT EXISTS(SELECT 1 FROM outlets WHERE outlet_code = code AND id != r.id) INTO taken;
      IF NOT taken THEN
        UPDATE outlets SET outlet_code = code WHERE id = r.id;
        EXIT;
      END IF;
      attempt := attempt + 1;
      IF attempt > 300 THEN RAISE EXCEPTION 'Cannot generate unique outlet code after 300 attempts'; END IF;
    END LOOP;
  END LOOP;
END $$;
