-- Shared SERP cache. One row per (normalized keyword, url).
CREATE TABLE prospect_serp_cache (
  keyword_norm TEXT NOT NULL,
  url          TEXT NOT NULL,
  domain       TEXT NOT NULL,
  title        TEXT,
  description  TEXT,
  position     INTEGER,
  fetched_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (keyword_norm, url)
);

CREATE INDEX idx_serp_cache_keyword ON prospect_serp_cache(keyword_norm, fetched_at DESC);
CREATE INDEX idx_serp_cache_domain  ON prospect_serp_cache(domain);

-- Cross-user domain facts, built up organically as users search.
CREATE TABLE domain_facts (
  domain              TEXT PRIMARY KEY,
  domain_authority    INTEGER,
  da_fetched_at       TIMESTAMPTZ,
  contact_email       TEXT,
  email_fetched_at    TIMESTAMPTZ,
  title               TEXT,
  description         TEXT,
  homepage_fetched_at TIMESTAMPTZ,
  seen_count          INTEGER DEFAULT 1,
  last_seen_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_domain_facts_da        ON domain_facts(domain_authority DESC NULLS LAST);
CREATE INDEX idx_domain_facts_seen      ON domain_facts(seen_count DESC);
CREATE INDEX idx_domain_facts_last_seen ON domain_facts(last_seen_at DESC);
