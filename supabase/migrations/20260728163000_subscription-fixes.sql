ALTER TABLE users ALTER COLUMN subscription_plan SET DEFAULT 'none';
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
