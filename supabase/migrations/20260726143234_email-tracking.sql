-- Email events (sent, open, click, reply, bounce)
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT,
  gmail_message_id TEXT,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  sequence_id UUID,
  sequence_step INTEGER,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'open', 'click', 'reply', 'bounce')),
  recipient TEXT,
  subject TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_user ON email_events(user_id);
CREATE INDEX IF NOT EXISTS idx_email_events_message ON email_events(message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_prospect ON email_events(prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);

-- Email templates
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  category TEXT DEFAULT 'custom' CHECK (category IN ('outreach', 'guest_post', 'resource_page', 'skyscraper', 'link_reclamation', 'custom')),
  is_seed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
