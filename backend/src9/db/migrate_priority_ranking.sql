-- Adds paid priority ranking for vendors (existing database only - a fresh
-- db:setup already includes this via schema.sql). Safe to run once.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS priority_score INT NOT NULL DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS priority_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS priority_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  boost_score INT NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS priority_purchase_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES priority_packages(id),
  amount NUMERIC(10,2) NOT NULL,
  ecocash_reference TEXT,
  status payment_submission_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS priority_purchase_submissions_vendor_idx ON priority_purchase_submissions (vendor_id);
CREATE INDEX IF NOT EXISTS priority_purchase_submissions_status_idx ON priority_purchase_submissions (status);

-- Seed two starter packages so there's something to test/sell right away -
-- admins can edit price/name/duration/boost or add more via the admin panel.
INSERT INTO priority_packages (name, price, duration_days, boost_score)
SELECT 'Silver Boost', 8.00, 30, 50
WHERE NOT EXISTS (SELECT 1 FROM priority_packages WHERE name = 'Silver Boost');

INSERT INTO priority_packages (name, price, duration_days, boost_score)
SELECT 'Gold Boost', 15.00, 30, 100
WHERE NOT EXISTS (SELECT 1 FROM priority_packages WHERE name = 'Gold Boost');
