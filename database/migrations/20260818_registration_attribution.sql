ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS registration_id uuid;

ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_registration_id_fkey;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_registration_id_fkey
  FOREIGN KEY (registration_id)
  REFERENCES instructor_registrations(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS analytics_events_registration_created_idx
  ON analytics_events (registration_id, created_at DESC)
  WHERE registration_id IS NOT NULL;
