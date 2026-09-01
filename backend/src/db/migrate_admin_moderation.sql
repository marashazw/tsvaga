-- Adds admin blocking capability for users. Run alongside the separate
-- ALTER TYPE statement in migrate_admin_moderation.js (that one has to run
-- on its own - see the comment there for why).

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
