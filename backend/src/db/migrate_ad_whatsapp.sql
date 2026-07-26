-- Adds a WhatsApp contact number to ads (existing database only - a fresh
-- db:setup already includes this via schema.sql). Safe to run once.

ALTER TABLE ads ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
