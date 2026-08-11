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
