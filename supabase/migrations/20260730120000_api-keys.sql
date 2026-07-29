CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_user     ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash     ON api_keys(key_hash) WHERE revoked_at IS NULL;
