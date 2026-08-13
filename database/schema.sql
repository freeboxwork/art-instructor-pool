CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS instructor_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL CHECK (region IN ('서울', '경기·인천', '부산·울산·경남', '대구·경북', '대전·세종·충청', '광주·전라', '강원', '제주')),
  major text CHECK (major IS NULL OR char_length(major) BETWEEN 1 AND 100),
  teaching_subject text CHECK (teaching_subject IS NULL OR char_length(teaching_subject) <= 100),
  career_level text CHECK (career_level IS NULL OR career_level IN ('경력 없음', '1년 미만', '1~3년', '3년 이상')),
  certification text CHECK (certification IS NULL OR char_length(certification) <= 100),
  job_seeking text CHECK (job_seeking IS NULL OR job_seeking IN ('현재 구직중', '향후 구직 의향 있음', '구직 의향 없음')),
  course_interest text CHECK (course_interest IS NULL OR course_interest IN ('네, 관심 있어요', '아니오')),
  additional_notes text CHECK (additional_notes IS NULL OR char_length(additional_notes) <= 500),
  can_teach_children boolean NOT NULL,
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  email_opt_in boolean NOT NULL DEFAULT true,
  consented_at timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL DEFAULT '2026-08-03',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instructor_registrations_email_normalized_key UNIQUE (email_normalized)
);

CREATE INDEX IF NOT EXISTS instructor_registrations_created_at_idx
  ON instructor_registrations (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS instructor_registrations_status_idx
  ON instructor_registrations (status);
CREATE INDEX IF NOT EXISTS instructor_registrations_email_search_idx
  ON instructor_registrations USING gin (email_normalized gin_trgm_ops);

CREATE OR REPLACE FUNCTION set_instructor_registrations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS instructor_registrations_set_updated_at
  ON instructor_registrations;
CREATE TRIGGER instructor_registrations_set_updated_at
BEFORE UPDATE ON instructor_registrations
FOR EACH ROW
EXECUTE FUNCTION set_instructor_registrations_updated_at();

-- Migration for databases created before the Q1~Q9 survey expansion.
-- Safe to re-run: columns are added only if missing, constraints are replaced idempotently.
ALTER TABLE instructor_registrations ALTER COLUMN major DROP NOT NULL;
ALTER TABLE instructor_registrations ALTER COLUMN career_level DROP NOT NULL;

ALTER TABLE instructor_registrations DROP CONSTRAINT IF EXISTS instructor_registrations_major_check;
ALTER TABLE instructor_registrations ADD CONSTRAINT instructor_registrations_major_check
  CHECK (major IS NULL OR char_length(major) BETWEEN 1 AND 100);

ALTER TABLE instructor_registrations DROP CONSTRAINT IF EXISTS instructor_registrations_career_level_check;
ALTER TABLE instructor_registrations ADD CONSTRAINT instructor_registrations_career_level_check
  CHECK (career_level IS NULL OR career_level IN ('경력 없음', '1년 미만', '1~3년', '3년 이상'));

ALTER TABLE instructor_registrations ADD COLUMN IF NOT EXISTS teaching_subject text;
ALTER TABLE instructor_registrations DROP CONSTRAINT IF EXISTS instructor_registrations_teaching_subject_check;
ALTER TABLE instructor_registrations ADD CONSTRAINT instructor_registrations_teaching_subject_check
  CHECK (teaching_subject IS NULL OR char_length(teaching_subject) <= 100);

ALTER TABLE instructor_registrations ADD COLUMN IF NOT EXISTS certification text;
ALTER TABLE instructor_registrations DROP CONSTRAINT IF EXISTS instructor_registrations_certification_check;
ALTER TABLE instructor_registrations ADD CONSTRAINT instructor_registrations_certification_check
  CHECK (certification IS NULL OR char_length(certification) <= 100);

ALTER TABLE instructor_registrations ADD COLUMN IF NOT EXISTS job_seeking text;
ALTER TABLE instructor_registrations DROP CONSTRAINT IF EXISTS instructor_registrations_job_seeking_check;
ALTER TABLE instructor_registrations ADD CONSTRAINT instructor_registrations_job_seeking_check
  CHECK (job_seeking IS NULL OR job_seeking IN ('현재 구직중', '향후 구직 의향 있음', '구직 의향 없음'));

ALTER TABLE instructor_registrations ADD COLUMN IF NOT EXISTS course_interest text;
ALTER TABLE instructor_registrations DROP CONSTRAINT IF EXISTS instructor_registrations_course_interest_check;
ALTER TABLE instructor_registrations ADD CONSTRAINT instructor_registrations_course_interest_check
  CHECK (course_interest IS NULL OR course_interest IN ('네, 관심 있어요', '아니오'));

ALTER TABLE instructor_registrations ADD COLUMN IF NOT EXISTS additional_notes text;
ALTER TABLE instructor_registrations DROP CONSTRAINT IF EXISTS instructor_registrations_additional_notes_check;
ALTER TABLE instructor_registrations ADD CONSTRAINT instructor_registrations_additional_notes_check
  CHECK (additional_notes IS NULL OR char_length(additional_notes) <= 500);

CREATE TABLE IF NOT EXISTS analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name IN (
    'intro_view',
    'intro_cta_clicked',
    'register_view',
    'registration_started',
    'registration_validation_failed',
    'registration_submit_clicked',
    'registration_succeeded',
    'registration_failed',
    'complete_view',
    'complete_return_clicked'
  )),
  session_key text NOT NULL CHECK (char_length(session_key) BETWEEN 8 AND 64),
  visitor_key uuid,
  experiment_key text,
  experiment_variant text CHECK (experiment_variant IS NULL OR experiment_variant IN ('A', 'B')),
  assignment_method text CHECK (assignment_method IS NULL OR assignment_method IN ('random', 'override')),
  page_path text NOT NULL CHECK (page_path IN (
    '/',
    '/1-intro.dc.html',
    '/2-register.dc.html',
    '/3-complete.dc.html'
  )),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_created_at_idx
  ON analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_created_at_idx
  ON analytics_events (session_key, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_experiment_variant_created_idx
  ON analytics_events (experiment_key, experiment_variant, created_at DESC);

-- Migration for analytics tables created before the mobile A/B test.
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

-- Read-only MCP access tokens. Raw tokens are never stored.
CREATE TABLE IF NOT EXISTS mcp_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  token_prefix text NOT NULL CHECK (char_length(token_prefix) BETWEEN 9 AND 32),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  scopes text[] NOT NULL DEFAULT ARRAY['analytics:read', 'registrations:read']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT mcp_access_tokens_scopes_check CHECK (
    scopes <@ ARRAY['analytics:read', 'registrations:read']::text[]
    AND cardinality(scopes) > 0
  )
);

CREATE INDEX IF NOT EXISTS mcp_access_tokens_active_idx
  ON mcp_access_tokens (created_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS mcp_access_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_id uuid NOT NULL REFERENCES mcp_access_tokens(id) ON DELETE CASCADE,
  tool_name text NOT NULL CHECK (char_length(tool_name) BETWEEN 1 AND 100),
  success boolean NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_access_logs_token_called_at_idx
  ON mcp_access_logs (token_id, called_at DESC);

CREATE INDEX IF NOT EXISTS mcp_access_logs_called_at_idx
  ON mcp_access_logs (called_at DESC);
