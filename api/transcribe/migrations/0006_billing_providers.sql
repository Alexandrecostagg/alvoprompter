ALTER TABLE subscriptions ADD COLUMN provider TEXT NOT NULL DEFAULT 'asaas' CHECK (provider IN ('asaas', 'apple'));
ALTER TABLE subscriptions ADD COLUMN asaas_last_paid_payment_id TEXT;

CREATE TABLE IF NOT EXISTS apple_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  app_account_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apple_subscriptions (
  original_transaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('Production', 'Sandbox')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkout_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('creator', 'studio')),
  asaas_checkout_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);
