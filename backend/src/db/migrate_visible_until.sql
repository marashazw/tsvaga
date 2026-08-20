-- Adds a 5-day "stays visible in My Requests" window, separate from the
-- short vendor-matching expires_at. Existing database only - a fresh
-- db:setup already includes this via schema.sql. Safe to run once.

ALTER TABLE requests ADD COLUMN IF NOT EXISTS visible_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 days');
