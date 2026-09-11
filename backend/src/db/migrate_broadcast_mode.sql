ALTER TABLE requests ADD COLUMN IF NOT EXISTS broadcast_mode TEXT NOT NULL DEFAULT 'nearby'
  CHECK (broadcast_mode IN ('nearby', 'nationwide', 'custom_area'));
