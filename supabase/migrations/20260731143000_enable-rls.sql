-- Enable Row-Level Security on every public table.
-- The app accesses all tables via the service_role key (which bypasses RLS),
-- so no policies are needed — enabling RLS with zero policies locks out the
-- anon key that's bundled into the public JS.

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites               ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlinks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlink_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_serp_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_facts        ENABLE ROW LEVEL SECURITY;
