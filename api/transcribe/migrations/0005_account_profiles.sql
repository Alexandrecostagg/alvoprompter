CREATE TABLE IF NOT EXISTS account_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 30),
  organization TEXT NOT NULL DEFAULT '' CHECK (length(organization) <= 100),
  updated_at TEXT NOT NULL
);
