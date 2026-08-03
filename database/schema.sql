CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS instructor_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL CHECK (region IN ('서울', '경기·인천', '부산·울산·경남', '대구·경북', '대전·세종·충청', '광주·전라', '강원', '제주')),
  major text NOT NULL CHECK (char_length(major) BETWEEN 1 AND 100),
  career_level text NOT NULL CHECK (career_level IN ('경력 없음', '1년 미만', '1~3년', '3년 이상')),
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
