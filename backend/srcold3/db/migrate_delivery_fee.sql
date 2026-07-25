-- Adds a separate delivery_fee to offers (existing database only - a fresh
-- db:setup already includes this via schema.sql). Safe to run once.

ALTER TABLE offers ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
