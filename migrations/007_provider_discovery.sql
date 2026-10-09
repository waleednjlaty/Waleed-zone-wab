BEGIN;
SET LOCAL lock_timeout='2s';
CREATE TABLE IF NOT EXISTS site_provider_discovery (
  application_id INTEGER PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  source_revision TEXT NOT NULL CHECK (source_revision ~ '^[a-f0-9]{64}$'),
  source_url TEXT NOT NULL CHECK (length(source_url)<=4096),
  provider_pages JSONB NOT NULL CHECK (jsonb_typeof(provider_pages)='array' AND jsonb_array_length(provider_pages)<=3),
  expires_at TIMESTAMPTZ NOT NULL
);
COMMIT;
