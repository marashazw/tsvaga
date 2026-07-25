-- Tsvaga schema
-- Requires PostGIS: CREATE EXTENSION IF NOT EXISTS postgis;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('requester', 'vendor', 'both', 'admin');
CREATE TYPE request_status AS ENUM ('open', 'matched', 'completed', 'cancelled', 'expired');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');
CREATE TYPE order_status AS ENUM ('confirmed', 'out_for_delivery', 'delivered', 'cancelled');
CREATE TYPE subscription_status AS ENUM ('inactive', 'active', 'waived');
CREATE TYPE payment_submission_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE fulfillment_type AS ENUM ('delivery', 'pickup');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'requester',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vendors (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  location GEOGRAPHY(Point, 4326) NOT NULL,
  address_text TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  rating_avg NUMERIC(2,1) DEFAULT 5.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendors_location_gix ON vendors USING GIST (location);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT,
  synonyms TEXT[] DEFAULT '{}'
);

CREATE TABLE vendor_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  typical_price NUMERIC(10,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, product_id)
);

CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_text TEXT NOT NULL,
  quantity TEXT,
  -- 'location' is the SEARCH center (where the requester is standing / wants to
  -- search around) - it is NOT necessarily the delivery destination. See
  -- fulfillment_type and delivery_address_text below.
  location GEOGRAPHY(Point, 4326) NOT NULL,
  address_text TEXT,
  radius_km NUMERIC(4,1) NOT NULL DEFAULT 5,
  fulfillment_type fulfillment_type NOT NULL DEFAULT 'delivery',
  -- Free-text delivery address/landmark, only meaningful when fulfillment_type
  -- = 'delivery'. If left blank, the vendor should assume delivery to
  -- address_text (the search location) by default. Null/ignored for 'pickup'.
  delivery_address_text TEXT,
  status request_status NOT NULL DEFAULT 'open',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX requests_location_gix ON requests USING GIST (location);

CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL,
  -- Separate from 'price' so both sides can see an itemized breakdown rather
  -- than guessing whether delivery is already baked into the item price.
  -- Meaningful only when the request's fulfillment_type = 'delivery'; vendors
  -- responding to a pickup request should leave this at 0.
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_eta_minutes INT NOT NULL,
  message TEXT,
  status offer_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, vendor_id)
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES requests(id),
  offer_id UUID NOT NULL REFERENCES offers(id),
  status order_status NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

-- Web Push subscriptions, so a vendor can be alerted to new nearby requests
-- even when the dashboard tab/app isn't open (only requires the browser/OS
-- to be running with the service worker registered).
CREATE TABLE vendor_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendor_push_subscriptions_vendor_idx ON vendor_push_subscriptions (vendor_id);

-- One row per vendor tracking whether they're "paid up" and can see full
-- request details / respond with offers. 'waived' means an admin has granted
-- free access (expires_at is ignored when waived).
CREATE TABLE subscriptions (
  vendor_id UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  status subscription_status NOT NULL DEFAULT 'inactive',
  expires_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users(id),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A vendor's self-reported EcoCash payment, awaiting admin confirmation.
CREATE TABLE payment_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  ecocash_reference TEXT,
  note TEXT,
  status payment_submission_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_submissions_vendor_idx ON payment_submissions (vendor_id);
CREATE INDEX payment_submissions_status_idx ON payment_submissions (status);

-- Single-row table of admin-configurable platform settings.
CREATE TABLE platform_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforce a single row
  subscription_price NUMERIC(10,2) NOT NULL DEFAULT 7.00,
  subscription_currency TEXT NOT NULL DEFAULT 'USD',
  ecocash_number TEXT NOT NULL DEFAULT '0772738126',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
