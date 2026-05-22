ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS email        TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone        TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_name   TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS city         TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS country      TEXT DEFAULT 'Malaysia';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS plan         TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'trial';
-- status: trial | active | expired | suspended
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS activated_at  TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS suspended_at  TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS onboarding_step INT NOT NULL DEFAULT 0;
-- 0=signed up, 1=server installed, 2=pos installed, 3=menu added, 4=live
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS signup_source TEXT DEFAULT 'website';

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);
CREATE INDEX IF NOT EXISTS idx_restaurants_trial  ON restaurants(trial_ends_at);
