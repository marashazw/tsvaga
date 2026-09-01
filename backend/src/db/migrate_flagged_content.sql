CREATE TABLE IF NOT EXISTS flagged_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  context TEXT NOT NULL,
  submitted_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flagged_content_user_idx ON flagged_content (user_id);
CREATE INDEX IF NOT EXISTS flagged_content_created_idx ON flagged_content (created_at DESC);
