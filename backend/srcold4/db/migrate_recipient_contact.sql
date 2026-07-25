-- Adds recipient name/phone to an existing database (fresh db:setup already
-- includes this via schema.sql). Safe to run once.

ALTER TABLE requests ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
