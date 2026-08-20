-- Adds category tagging to requests and notification preferences to vendors
-- (existing database only - a fresh db:setup already includes this via
-- schema.sql). Safe to run once.

ALTER TABLE requests ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT ARRAY['miscellaneous'];

-- Postgres populates this default for all existing rows automatically when
-- adding a column with a constant DEFAULT - no separate UPDATE needed, and
-- new vendors get the same default going forward until they customize it.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notify_categories TEXT[] NOT NULL DEFAULT ARRAY[
  'groceries','electronics','clothing','hardware','health','automotive',
  'home','beauty','stationery','baby_kids','sports','miscellaneous'
];
