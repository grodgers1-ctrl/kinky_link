ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing'
    CHECK (subscription_status IN ('active', 'trialing', 'canceled', 'past_due', 'incomplete')),
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'monthly'
    CHECK (subscription_plan IN ('monthly', 'yearly', 'none')),
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
