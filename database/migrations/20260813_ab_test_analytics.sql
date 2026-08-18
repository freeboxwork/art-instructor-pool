ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS visitor_key uuid;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS experiment_key text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS experiment_variant text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS assignment_method text;

ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_experiment_variant_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_experiment_variant_check
  CHECK (experiment_variant IS NULL OR experiment_variant IN ('A', 'B'));

ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_assignment_method_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_assignment_method_check
  CHECK (assignment_method IS NULL OR assignment_method IN ('random', 'override'));

CREATE INDEX IF NOT EXISTS analytics_events_experiment_variant_created_idx
  ON analytics_events (experiment_key, experiment_variant, created_at DESC);
