CREATE TABLE backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  first_seen DATE,
  last_seen DATE,
  is_indexed BOOLEAN,
  health_status TEXT DEFAULT 'pending' CHECK (health_status IN ('pending', 'healthy', 'redirected', 'broken', 'unreachable', 'error')),
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, source_url, target_url)
);

CREATE INDEX idx_backlinks_user ON backlinks(user_id);
CREATE INDEX idx_backlinks_site ON backlinks(site_id);
CREATE INDEX idx_backlinks_source ON backlinks(source_url);
CREATE INDEX idx_backlinks_health ON backlinks(health_status);

CREATE TABLE backlink_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backlink_id UUID NOT NULL REFERENCES backlinks(id) ON DELETE CASCADE,
  health_status TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backlink_history_bl ON backlink_history(backlink_id);

CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  source TEXT DEFAULT 'manual' CHECK (source IN ('gsc', 'suggest', 'manual')),
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  avg_position REAL DEFAULT 0,
  saved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

CREATE INDEX idx_keywords_user ON keywords(user_id);
CREATE INDEX idx_keywords_site ON keywords(site_id);
