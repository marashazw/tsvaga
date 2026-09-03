ALTER TABLE products ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'product';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_type_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_type_check CHECK (type IN ('product', 'service'));
  END IF;
END$$;

ALTER TABLE vendor_inventory ADD COLUMN IF NOT EXISTS pricing_type TEXT NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_inventory_pricing_type_check') THEN
    ALTER TABLE vendor_inventory ADD CONSTRAINT vendor_inventory_pricing_type_check
      CHECK (pricing_type IN ('fixed', 'hourly', 'starting_from'));
  END IF;
END$$;
