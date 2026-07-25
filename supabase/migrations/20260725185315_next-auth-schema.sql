-- The @auth/supabase-adapter uses the "next_auth" schema
CREATE SCHEMA IF NOT EXISTS "next_auth";

-- Users table (column names match PostgREST camelCase→snake_case conversion)
CREATE TABLE IF NOT EXISTS "next_auth"."users" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  email_verified TIMESTAMPTZ,
  image TEXT
);

-- Accounts table
CREATE TABLE IF NOT EXISTS "next_auth"."accounts" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "next_auth"."users"(id) ON DELETE CASCADE,
  type TEXT,
  provider TEXT,
  provider_account_id TEXT,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  oauth_token_secret TEXT,
  oauth_token TEXT
);

-- Sessions table
CREATE TABLE IF NOT EXISTS "next_auth"."sessions" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "next_auth"."users"(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ,
  session_token TEXT
);

-- Verification tokens table
CREATE TABLE IF NOT EXISTS "next_auth"."verification_tokens" (
  id SERIAL PRIMARY KEY,
  identifier TEXT,
  token TEXT,
  expires TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON "next_auth"."accounts"(user_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON "next_auth"."sessions"(user_id);
