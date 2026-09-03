-- Adds support for service requests (plumber, transport, tutoring, etc)
-- alongside the app's original product requests.

ALTER TABLE requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'product';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'requests_request_type_check'
  ) THEN
    ALTER TABLE requests ADD CONSTRAINT requests_request_type_check CHECK (request_type IN ('product', 'service'));
  END IF;
END$$;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS is_remote BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS dropoff_address_text TEXT;

-- Same backfill pattern used for the garden/leisure addition: any vendor who
-- still has the full original category set selected (i.e. never customized
-- it away from "all") gets the new service categories appended too, so
-- "notify me about everything" keeps actually meaning everything. A vendor
-- who deliberately narrowed their own selection is left untouched.
UPDATE vendors
SET notify_categories = notify_categories || ARRAY[
  'plumbing','electrical_services','transport_logistics','construction',
  'it_design_services','tutoring_lessons','cleaning_services','legal_admin_services',
  'event_services','repair_services','automotive_services','beauty_wellness_services'
]
WHERE notify_categories @> ARRAY[
  'groceries','electronics','clothing','hardware','health','automotive',
  'home','beauty','stationery','baby_kids','sports','garden','leisure','miscellaneous'
]
AND NOT (notify_categories @> ARRAY['plumbing']);
