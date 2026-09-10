-- Phase 3b: cache CC-index page resolutions per domain. Without this, every
-- find_competitor_backlinks call re-pays index lookups for the same domains
-- (and the CC index API is slow/unreliable enough for that to matter).
CREATE TABLE cc_domain_pages (
  domain      TEXT NOT NULL,
  url         TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (domain, url)
);

ALTER TABLE cc_domain_pages ENABLE ROW LEVEL SECURITY;
