-- Explicit operator/pre-deploy only; additive and repeatable. No catalog rewrites.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS site_legacy_download_grants (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  source_revision TEXT NOT NULL,
  ready_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > ready_at)
);
CREATE INDEX IF NOT EXISTS site_legacy_download_grants_expiry_idx ON site_legacy_download_grants(expires_at);
ALTER TABLE site_daily_metrics DROP CONSTRAINT IF EXISTS site_daily_metrics_metric_check;
ALTER TABLE site_daily_metrics ADD CONSTRAINT site_daily_metrics_metric_check CHECK
  (metric IN ('detail_view','download_page_view','download_prepare','download_redeem','telegram_redirect','catalog_view','external_download_redirect'));
COMMIT;
