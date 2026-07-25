-- Adds delivery-vs-pickup support to an existing database (safe to run once;
-- uses IF NOT EXISTS / exception guards so it won't error on a fresh db:setup
-- database that already has these from schema.sql).

DO $$ BEGIN
  CREATE TYPE fulfillment_type AS ENUM ('delivery', 'pickup');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS fulfillment_type fulfillment_type NOT NULL DEFAULT 'delivery';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS delivery_address_text TEXT;
