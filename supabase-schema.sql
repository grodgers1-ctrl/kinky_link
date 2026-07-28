-- UUID generation is built-in via gen_random_uuid() (Postgres 13+)

-- Users table (synced with NextAuth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'trialing' CHECK (subscription_status IN ('active', 'trialing', 'canceled', 'past_due', 'incomplete')),
  subscription_plan TEXT DEFAULT 'none' CHECK (subscription_plan IN ('monthly', 'yearly', 'none')),
  trial_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  subscription_current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connected sites (from GSC)
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  gsc_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, url)
);

-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prospects (discovered targets)
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  domain TEXT,
  title TEXT,
  description TEXT,
  domain_authority INTEGER,
  email TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  name TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'prospect' CHECK (status IN ('prospect', 'contacted', 'replied', 'live_link', 'declined', 'archived')),
  pipeline_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_prospects_user ON prospects(user_id);
CREATE INDEX idx_prospects_campaign ON prospects(campaign_id);
CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_campaigns_user ON campaigns(user_id);
CREATE INDEX idx_sites_user ON sites(user_id);

-- Backlinks (from GSC)
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

-- Backlink health check history
CREATE TABLE backlink_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backlink_id UUID NOT NULL REFERENCES backlinks(id) ON DELETE CASCADE,
  health_status TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backlink_history_bl ON backlink_history(backlink_id);

-- Keywords (saved from GSC, Suggest, or manual)
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

-- Notifications (in-app alerts)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read = FALSE;
