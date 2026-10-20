CREATE TABLE app_policy (
  platform TEXT PRIMARY KEY CHECK (platform IN ('ios','android')),
  minimum_build INTEGER NOT NULL DEFAULT 0 CHECK (minimum_build >= 0),
  version TEXT NOT NULL DEFAULT '1.6.4',
  revision INTEGER NOT NULL DEFAULT 0,
  actor_id TEXT,
  updated_at TEXT
);
INSERT INTO app_policy (platform) VALUES ('ios'), ('android');
CREATE TABLE app_policy_audit (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
