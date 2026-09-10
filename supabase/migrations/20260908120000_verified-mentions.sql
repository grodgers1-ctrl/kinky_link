-- Phase 1 (zero-cost plan): verified mentions cache + competitor SERP caching.
--
-- verified_mentions: one row per (candidate page url, competitor target_domain).
-- A row exists once we've fetched the page and know whether it really links to
-- the target. Cache hits mean repeat competitor queries cost zero fetches.
CREATE TABLE verified_mentions (
  url             TEXT NOT NULL,
  target_domain   TEXT NOT NULL,
  links_to_target BOOLEAN NOT NULL,
  anchor_text     TEXT,
  rel             TEXT CHECK (rel IN ('dofollow', 'nofollow')),
  link_url        TEXT,
  http_status     INTEGER,
  unverifiable    BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (url, target_domain)
);

CREATE INDEX idx_verified_mentions_target ON verified_mentions(target_domain, verified_at DESC);

-- Competitor queries now share the SERP cache instead of burning a Tavily call
-- every time. query_kind separates them from keyword SERPs.
ALTER TABLE prospect_serp_cache ADD COLUMN query_kind TEXT NOT NULL DEFAULT 'keyword';
ALTER TABLE prospect_serp_cache DROP CONSTRAINT prospect_serp_cache_pkey;
ALTER TABLE prospect_serp_cache ADD PRIMARY KEY (query_kind, keyword_norm, url);

-- App uses the service_role key (bypasses RLS); enabling RLS with no policies
-- locks out the bundled anon key, matching 20260731143000_enable-rls.sql.
ALTER TABLE verified_mentions ENABLE ROW LEVEL SECURITY;
