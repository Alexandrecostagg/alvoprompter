-- Rebuild only to extend the provider CHECK; preserve every existing column/row.
CREATE TABLE subscriptions_next (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('creator','studio')),
  status TEXT NOT NULL CHECK (status IN ('pending','active','past_due','canceled')),
  asaas_subscription_id TEXT UNIQUE,
  asaas_customer_id TEXT,
  current_period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancellation_reason TEXT,
  provider TEXT NOT NULL DEFAULT 'asaas' CHECK (provider IN ('asaas','apple','google')),
  asaas_last_paid_payment_id TEXT
);
INSERT INTO subscriptions_next SELECT id,user_id,plan,status,asaas_subscription_id,asaas_customer_id,current_period_end,created_at,updated_at,cancellation_reason,provider,asaas_last_paid_payment_id FROM subscriptions;
DROP TABLE subscriptions;
ALTER TABLE subscriptions_next RENAME TO subscriptions;
CREATE TABLE google_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, account_token TEXT NOT NULL UNIQUE);
CREATE TABLE google_subscriptions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_cipher TEXT NOT NULL,
  product_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
