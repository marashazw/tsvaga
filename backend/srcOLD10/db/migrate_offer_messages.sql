-- Adds per-offer bargaining chat (existing database only - a fresh db:setup
-- already includes this via schema.sql). Safe to run once.

CREATE TABLE IF NOT EXISTS offer_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offer_messages_offer_idx ON offer_messages (offer_id);
