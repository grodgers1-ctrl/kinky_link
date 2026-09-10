-- Phase 3 (zero-cost plan): Common Crawl link graph + provider usage caps.

-- Domains users have queried via find_competitor_backlinks. The quarterly
-- import script only extracts graph edges for these targets, keeping storage
-- tiny (we never import the full 2.8B-edge graph).
CREATE TABLE cc_targets (
  target_domain    TEXT PRIMARY KEY,
  first_queried_at TIMESTAMPTZ DEFAULT NOW(),
  last_queried_at  TIMESTAMPTZ DEFAULT NOW(),
  query_count      INTEGER DEFAULT 1
);

-- Filtered domain-level link graph: "source_domain links to target_domain,
-- seen in Common Crawl webgraph release crawl_id".
CREATE TABLE cc_link_graph (
  target_domain TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  crawl_id      TEXT NOT NULL, -- e.g. 'cc-main-2026-may-jun-jul'
  imported_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (target_domain, source_domain, crawl_id)
);

CREATE INDEX idx_cc_link_graph_target ON cc_link_graph(target_domain, crawl_id DESC);

-- Monthly row counters for row-billed providers (Moz free tier: 50 rows/mo).
-- Separate from api_key_usage (which is per-user, per-day, per-tool) because
-- provider quotas are account-wide and monthly.
CREATE TABLE provider_usage (
  provider TEXT NOT NULL,
  month    TEXT NOT NULL, -- 'YYYY-MM' (UTC)
  rows     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, month)
);

CREATE OR REPLACE FUNCTION bump_provider_usage(p_provider TEXT, p_month TEXT, p_rows INTEGER)
RETURNS INTEGER
LANGUAGE sql
AS $$
  INSERT INTO provider_usage (provider, month, rows)
  VALUES (p_provider, p_month, p_rows)
  ON CONFLICT (provider, month)
  DO UPDATE SET rows = provider_usage.rows + p_rows
  RETURNING rows;
$$;

-- verified_mentions gains the page title so CC-tier candidates (which have no
-- SERP title) can still show one after verification.
ALTER TABLE verified_mentions ADD COLUMN page_title TEXT;

-- App uses the service_role key (bypasses RLS); enabling RLS with no policies
-- locks out the bundled anon key, matching 20260731143000_enable-rls.sql.
ALTER TABLE cc_targets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_link_graph   ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage  ENABLE ROW LEVEL SECURITY;
