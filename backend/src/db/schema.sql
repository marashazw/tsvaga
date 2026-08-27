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
CREATE TYPE ad_status AS ENUM ('pending', 'active', 'rejected', 'expired');

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
  is_online BOOLEAN NOT NULL DEFAULT true,
  rating_avg NUMERIC(2,1) DEFAULT 5.0,
  -- Paid priority ranking boost (separate from the base subscription that's
  -- required just to respond at all). Effective only while priority_expires_at
  -- is in the future; expired boosts are treated as zero without needing a
  -- cleanup job.
  priority_score INT NOT NULL DEFAULT 0,
  priority_expires_at TIMESTAMPTZ,
  -- Which categories of request this vendor wants to be alerted about. Defaults
  -- to every category (set explicitly at registration time) so nothing changes
  -- for a vendor who never touches this setting. A request tagged only
  -- 'miscellaneous' (i.e. the requester didn't pick/match a specific category)
  -- is broadcast to every nearby vendor regardless of this list.
  notify_categories TEXT[] NOT NULL DEFAULT ARRAY[
    'groceries','electronics','clothing','hardware','health','automotive',
    'home','beauty','stationery','baby_kids','sports','garden','leisure','miscellaneous'
  ],
  -- How this vendor decides which nearby requests to be alerted about:
  --   'categories'                - match on notify_categories only (default)
  --   'categories_and_inventory'  - alerted if EITHER the category matches OR
  --                                 the request matches something in their
  --                                 inventory (broadens the net)
  --   'inventory_only'            - ONLY alerted on an inventory match;
  --                                 category selection is ignored entirely
  notify_mode TEXT NOT NULL DEFAULT 'categories'
    CHECK (notify_mode IN ('categories', 'categories_and_inventory', 'inventory_only')),
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
  -- The requester's own account phone may not be the right contact - they
  -- might be ordering for someone else, or want a different number reachable
  -- at the door/pickup counter. Both optional; if blank, the vendor should
  -- fall back to contacting the requester's account phone directly.
  recipient_name TEXT,
  recipient_phone TEXT,
  -- One or more category tags for this request, chosen (or overridden) by the
  -- requester, auto-suggested client-side from product_text. Always has at
  -- least one entry - defaults to just ['miscellaneous'] when nothing more
  -- specific was assigned, which is what triggers a broadcast-to-everyone
  -- match rather than a category-filtered one.
  categories TEXT[] NOT NULL DEFAULT ARRAY['miscellaneous'],
  -- Separate from expires_at above (that one governs the short vendor-matching
  -- window). This one controls how long a request stays visible in the
  -- requester's own "My requests" history - hidden from that list once past,
  -- unless the requester renews it (pushing this out another 5 days) before
  -- then. Does not affect matching/offers at all, purely a history-view thing.
  visible_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 days'),
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

-- A private back-and-forth between the requester and ONE specific vendor,
-- scoped to a single offer - not visible to any other vendor who responded
-- to the same request. This is what lets a requester negotiate price/timing
-- with each vendor separately, before (or after) accepting an offer.
CREATE TABLE offer_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX offer_messages_offer_idx ON offer_messages (offer_id);

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

-- Web Push subscriptions for ANY signed-in user (requester or vendor), so
-- they can be alerted (new nearby request, order accepted, out for delivery,
-- delivered, etc.) even when the app/tab isn't open, as long as the
-- browser/OS is running with the service worker registered.
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

-- One row per vendor tracking whether they're "paid up" and can see full
-- request details / respond with offers. 'waived' means an admin has granted
-- free access (expires_at is ignored when waived).
CREATE TABLE subscriptions (
  vendor_id UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  status subscription_status NOT NULL DEFAULT 'inactive',
  expires_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users(id),
  note TEXT,
  -- Reset to false whenever the subscription is (re)activated/extended, so
  -- the "5 days until expiry" push notification fires once per expiry cycle
  -- rather than either spamming daily or never firing again after the first time.
  notified_expiry_soon BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracks which phone numbers have ever received the automatic new-vendor
-- trial waiver - kept intentionally separate from the vendors/users tables
-- (no FK, never cascaded away) so that deleting an account and registering
-- again with the SAME phone number can't be used to get a second free trial.
CREATE TABLE vendor_trial_usage (
  phone TEXT PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  ad_price_per_day NUMERIC(10,2) NOT NULL DEFAULT 2.00,
  max_active_ads INT NOT NULL DEFAULT 5,
  -- When enabled, a brand-new vendor's subscription is automatically granted
  -- a free trial for auto_waive_days instead of starting 'inactive'. Each
  -- phone number can only ever receive this once (see vendor_trial_usage).
  auto_waive_new_vendors BOOLEAN NOT NULL DEFAULT false,
  auto_waive_days INT NOT NULL DEFAULT 30,
  -- Lets an admin hide the "Install Tsvaga" banner (and its security-warning
  -- explainer note) platform-wide, e.g. once the app is on the Play Store
  -- and the PWA install prompt is no longer needed, or if it's causing more
  -- confusion than it's worth for now.
  install_prompt_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Admin-defined priority ranking packages (e.g. "Gold - $15/month - rank
-- boost 100"). Vendors pay for one of these on top of their base
-- subscription, to appear higher in a requester's offer list.
CREATE TABLE priority_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  boost_score INT NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same manual EcoCash-pay + admin-approve pattern as the base subscription.
CREATE TABLE priority_purchase_submissions (
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
CREATE INDEX priority_purchase_submissions_vendor_idx ON priority_purchase_submissions (vendor_id);
CREATE INDEX priority_purchase_submissions_status_idx ON priority_purchase_submissions (status);

-- Paid ads - open to any signed-in user (vendor or not), not just vendors.
-- Video ads use a direct video file URL (played with a plain <video> tag) or
-- an embeddable link - there's no self-hosted video upload/storage here, so
-- the advertiser hosts the file/stream themselves and just gives us the URL.
CREATE TABLE ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_type TEXT NOT NULL CHECK (ad_type IN ('text', 'video')),
  title TEXT NOT NULL,
  body TEXT,
  video_url TEXT,
  image_url TEXT,
  link_url TEXT,
  -- International-format phone number (e.g. +263771234567) for a "chat on
  -- WhatsApp" button, separate from a generic click-through link - opens
  -- wa.me with a pre-composed message rather than just linking somewhere.
  whatsapp_number TEXT,
  duration_days INT NOT NULL DEFAULT 7,
  amount NUMERIC(10,2) NOT NULL,
  ecocash_reference TEXT,
  status ad_status NOT NULL DEFAULT 'pending',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ads_status_idx ON ads (status);
CREATE INDEX ads_owner_idx ON ads (owner_id);
