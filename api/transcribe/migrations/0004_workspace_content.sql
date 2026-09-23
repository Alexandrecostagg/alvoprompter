CREATE TABLE IF NOT EXISTS workspace_content (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  collection TEXT NOT NULL CHECK(collection IN ('scripts', 'schedules', 'brandkit')),
  key TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY(workspace_id, collection, key)
);
