-- Additive/operator-run only. NEVER called from startup or a request handler.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS site_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS site_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS site_sessions_user_id_idx ON site_sessions(user_id);
CREATE TABLE IF NOT EXISTS site_favorites (
  user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,application_id)
);
CREATE TABLE IF NOT EXISTS site_rate_limits (
  key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at TIMESTAMPTZ NOT NULL
);
-- Supports bounded limiter cleanup. Not a speculative catalog/search index.
CREATE INDEX IF NOT EXISTS site_rate_limits_reset_idx ON site_rate_limits(reset_at);
CREATE TABLE IF NOT EXISTS site_visits (
  id SERIAL PRIMARY KEY, visitor_key TEXT NOT NULL, visit_day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(visitor_key,visit_day)
);
COMMIT;
