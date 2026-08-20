-- Upgrades the vendor notification preference from a simple boolean
-- ("inventory only" on/off) to a three-way mode: 'categories' (default),
-- 'categories_and_inventory' (either matches), or 'inventory_only'.
-- Existing database only - a fresh db:setup already includes this via
-- schema.sql. Safe to run once.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notify_mode TEXT NOT NULL DEFAULT 'categories';

DO $$ BEGIN
  ALTER TABLE vendors ADD CONSTRAINT vendors_notify_mode_check
    CHECK (notify_mode IN ('categories', 'categories_and_inventory', 'inventory_only'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Carry forward anyone who'd already turned on the old boolean toggle.
UPDATE vendors SET notify_mode = 'inventory_only'
WHERE notify_inventory_only = true AND notify_mode = 'categories';
