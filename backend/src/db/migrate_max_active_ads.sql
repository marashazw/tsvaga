-- Adds a configurable cap on concurrently active ads (existing database only
-- - a fresh db:setup already includes this via schema.sql). Safe to run once.

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS max_active_ads INT NOT NULL DEFAULT 5;
