CREATE TABLE security_rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX security_rate_limits_expiry ON security_rate_limits(expires_at);
