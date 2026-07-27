-- Adds the new-vendor auto-trial feature and expiry-warning tracking
-- (existing database only - a fresh db:setup already includes all of this
-- via schema.sql). Safe to run once.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS notified_expiry_soon BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS vendor_trial_usage (
  phone TEXT PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS auto_waive_new_vendors BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS auto_waive_days INT NOT NULL DEFAULT 30;
