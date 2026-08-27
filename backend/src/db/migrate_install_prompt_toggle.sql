-- Adds an admin-controllable toggle for the "Install Tsvaga" PWA banner.
-- Existing database only - a fresh db:setup already includes this via
-- schema.sql. Safe to run once.

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS install_prompt_enabled BOOLEAN NOT NULL DEFAULT true;
