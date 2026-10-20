CREATE TABLE account_deletions (
  id TEXT PRIMARY KEY,
  uid_hash TEXT NOT NULL UNIQUE,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','needs_reauth','complete')),
  credential_cipher TEXT,
  credential_expires_at INTEGER NOT NULL,
  email_verified INTEGER NOT NULL,
  identity_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE account_resources (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('kv','r2-prefix')),
  resource_key TEXT NOT NULL,
  PRIMARY KEY (user_id,kind,resource_key)
);
-- A collaborator's deletion must not remove another team's shared work.
ALTER TABLE workspace_content RENAME TO workspace_content_before_deletion;
CREATE TABLE workspace_content (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  collection TEXT NOT NULL CHECK(collection IN ('scripts','schedules','brandkit')),
  key TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY(workspace_id,collection,key)
);
INSERT INTO workspace_content SELECT * FROM workspace_content_before_deletion;
DROP TABLE workspace_content_before_deletion;
