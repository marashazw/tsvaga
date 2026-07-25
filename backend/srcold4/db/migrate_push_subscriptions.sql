-- Generalizes push subscriptions from "vendor only" to "any signed-in user"
-- (needed so requesters can also get push notifications for order updates).
-- Safe to run once; migrates any existing vendor_push_subscriptions rows
-- across (vendor_id IS a user id, since vendors.id references users.id) and
-- leaves the old table in place, untouched, as a harmless backup.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
SELECT vendor_id, endpoint, p256dh, auth, created_at
FROM vendor_push_subscriptions
ON CONFLICT (endpoint) DO NOTHING;
