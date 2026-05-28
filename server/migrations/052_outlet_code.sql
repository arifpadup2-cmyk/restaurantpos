-- Add unique 6-char human-readable outlet code to every outlet.
-- Characters chosen to avoid visual ambiguity: no 0/O, 1/I/L.
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS outlet_code VARCHAR(6);

DO $$
DECLARE
  r       RECORD;
  code    TEXT;
  chars   TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  taken   BOOLEAN;
  attempt INT;
BEGIN
  FOR r IN SELECT id FROM outlets WHERE outlet_code IS NULL LOOP
    attempt := 0;
    LOOP
      code := '';
      FOR i IN 1..6 LOOP
        code := code || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
      END LOOP;
      SELECT EXISTS(SELECT 1 FROM outlets WHERE outlet_code = code) INTO taken;
      IF NOT taken THEN
        UPDATE outlets SET outlet_code = code WHERE id = r.id;
        EXIT;
      END IF;
      attempt := attempt + 1;
      IF attempt > 300 THEN RAISE EXCEPTION 'Cannot generate unique outlet code after 300 attempts'; END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS outlets_outlet_code_idx ON outlets (outlet_code);
ALTER TABLE outlets ALTER COLUMN outlet_code SET NOT NULL;
