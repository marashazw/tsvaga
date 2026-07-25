-- Adds paid ads (existing database only - a fresh db:setup already includes
-- this via schema.sql). Safe to run once.

DO $$ BEGIN
  CREATE TYPE ad_status AS ENUM ('pending', 'active', 'rejected', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_type TEXT NOT NULL CHECK (ad_type IN ('text', 'video')),
  title TEXT NOT NULL,
  body TEXT,
  video_url TEXT,
  image_url TEXT,
  link_url TEXT,
  duration_days INT NOT NULL DEFAULT 7,
  amount NUMERIC(10,2) NOT NULL,
  ecocash_reference TEXT,
  status ad_status NOT NULL DEFAULT 'pending',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_status_idx ON ads (status);
CREATE INDEX IF NOT EXISTS ads_owner_idx ON ads (owner_id);

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ad_price_per_day NUMERIC(10,2) NOT NULL DEFAULT 2.00;
