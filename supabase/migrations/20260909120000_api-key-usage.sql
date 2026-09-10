-- Phase 2 (zero-cost plan): per-user daily budgets for MCP tools that hit
-- external APIs. Free tiers only survive if loops and leaked keys can't drain
-- them. Keyed by user_id (not key_hash) so budgets survive key rotation.

CREATE TABLE api_key_usage (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      DATE NOT NULL DEFAULT CURRENT_DATE,
  tool     TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, tool)
);

-- Atomic increment-and-read; returns the new count for the day.
CREATE OR REPLACE FUNCTION bump_usage(p_user_id UUID, p_tool TEXT)
RETURNS INTEGER
LANGUAGE sql
AS $$
  INSERT INTO api_key_usage (user_id, day, tool, count)
  VALUES (p_user_id, CURRENT_DATE, p_tool, 1)
  ON CONFLICT (user_id, day, tool)
  DO UPDATE SET count = api_key_usage.count + 1
  RETURNING count;
$$;

-- App uses the service_role key (bypasses RLS); enabling RLS with no policies
-- locks out the bundled anon key, matching 20260731143000_enable-rls.sql.
ALTER TABLE api_key_usage ENABLE ROW LEVEL SECURITY;
