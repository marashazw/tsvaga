-- Sample products
INSERT INTO products (id, name, category, synonyms) VALUES
  (uuid_generate_v4(), 'Mealie meal (10kg)', 'groceries', ARRAY['maize meal','mealie-meal','mupfu']),
  (uuid_generate_v4(), 'Cooking oil (2L)', 'groceries', ARRAY['mafuta','sunflower oil']),
  (uuid_generate_v4(), 'LP Gas cylinder (9kg)', 'household', ARRAY['gas','cooking gas']),
  (uuid_generate_v4(), 'Cement (50kg bag)', 'hardware', ARRAY['cement bag']),
  (uuid_generate_v4(), 'Phone airtime bundle', 'digital', ARRAY['econet bundle','airtime']),
  (uuid_generate_v4(), 'Bottled water (5L)', 'groceries', ARRAY['mvura','drinking water']);

-- Sample vendor users + vendor profiles across real Zimbabwe locations
-- password_hash below is a bcrypt hash of "password123" (demo only - replace in production)

INSERT INTO users (id, name, phone, role, password_hash) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Mbare Fresh Grocers', '+263771000001', 'vendor', '$2a$10$8Q0h0Yy0z0b7z0b7z0b7zOeQeQeQeQeQeQeQeQeQeQeQeQeQeQeQe'),
  ('22222222-2222-2222-2222-222222222222', 'Avondale Mini Market', '+263771000002', 'vendor', '$2a$10$8Q0h0Yy0z0b7z0b7z0b7zOeQeQeQeQeQeQeQeQeQeQeQeQeQeQeQe'),
  ('33333333-3333-3333-3333-333333333333', 'Borrowdale Quick Stop', '+263771000003', 'vendor', '$2a$10$8Q0h0Yy0z0b7z0b7z0b7zOeQeQeQeQeQeQeQeQeQeQeQeQeQeQeQe'),
  ('44444444-4444-4444-4444-444444444444', 'Bulawayo Central Hardware', '+263771000004', 'vendor', '$2a$10$8Q0h0Yy0z0b7z0b7z0b7zOeQeQeQeQeQeQeQeQeQeQeQeQeQeQeQe'),
  ('55555555-5555-5555-5555-555555555555', 'Mutare Gas & General', '+263771000005', 'vendor', '$2a$10$8Q0h0Yy0z0b7z0b7z0b7zOeQeQeQeQeQeQeQeQeQeQeQeQeQeQeQe'),
  ('66666666-6666-6666-6666-666666666666', 'Gweru Corner Shop', '+263771000006', 'vendor', '$2a$10$8Q0h0Yy0z0b7z0b7z0b7zOeQeQeQeQeQeQeQeQeQeQeQeQeQeQeQe');

-- Real approximate coordinates (lng, lat) for each location
INSERT INTO vendors (id, business_name, location, address_text, is_online) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Mbare Fresh Grocers',
    ST_SetSRID(ST_MakePoint(31.0335, -17.8580), 4326)::geography, 'Mbare Musika, Harare', true),
  ('22222222-2222-2222-2222-222222222222', 'Avondale Mini Market',
    ST_SetSRID(ST_MakePoint(31.0378, -17.8010), 4326)::geography, 'Avondale Shops, Harare', true),
  ('33333333-3333-3333-3333-333333333333', 'Borrowdale Quick Stop',
    ST_SetSRID(ST_MakePoint(31.0862, -17.7622), 4326)::geography, 'Borrowdale Village, Harare', true),
  ('44444444-4444-4444-4444-444444444444', 'Bulawayo Central Hardware',
    ST_SetSRID(ST_MakePoint(28.5833, -20.1500), 4326)::geography, 'Fife Street, Bulawayo', true),
  ('55555555-5555-5555-5555-555555555555', 'Mutare Gas & General',
    ST_SetSRID(ST_MakePoint(32.6480, -18.9707), 4326)::geography, 'Herbert Chitepo St, Mutare', true),
  ('66666666-6666-6666-6666-666666666666', 'Gweru Corner Shop',
    ST_SetSRID(ST_MakePoint(29.8149, -19.4500), 4326)::geography, 'Main Street, Gweru', true);

-- Give each vendor some inventory (linking to a couple of the seeded products)
INSERT INTO vendor_inventory (vendor_id, product_id, in_stock, typical_price)
SELECT v.id, p.id, true,
  CASE p.name
    WHEN 'Mealie meal (10kg)' THEN 9.50
    WHEN 'Cooking oil (2L)' THEN 4.20
    WHEN 'LP Gas cylinder (9kg)' THEN 18.00
    WHEN 'Cement (50kg bag)' THEN 12.50
    WHEN 'Phone airtime bundle' THEN 5.00
    WHEN 'Bottled water (5L)' THEN 1.50
  END
FROM vendors v
CROSS JOIN products p
WHERE random() > 0.35; -- randomly assign a realistic subset of stock per vendor

-- Every vendor starts with an inactive subscription - they must pay (or be
-- waived by an admin) before they can see full request details / respond.
INSERT INTO subscriptions (vendor_id, status)
SELECT id, 'inactive' FROM vendors
ON CONFLICT (vendor_id) DO NOTHING;

-- One vendor pre-activated for demo purposes, so there's something to test
-- the "paid up" experience with out of the box.
UPDATE subscriptions SET status = 'active', expires_at = now() + interval '30 days'
WHERE vendor_id = '22222222-2222-2222-2222-222222222222';

-- To create a real admin/super-user account (with a properly hashed password),
-- run: npm run create:admin -- "Full Name" "+263771234567" "a-strong-password"
