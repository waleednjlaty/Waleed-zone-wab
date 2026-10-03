-- Additive/operator-run ONLY; not included in startup/release migration commands.
-- Requires 002_delivery_sources.sql (catalog revision). No catalog backfill writes.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS site_ad_eligibility (
  application_id INTEGER PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('unreviewed','eligible','blocked')),
  rights_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (rights_basis IN
    ('official','freeware','open_source','publisher_permission','owner_created','other_documented','unknown')),
  review_notes TEXT NOT NULL DEFAULT '' CHECK (length(review_notes) <= 1000),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewed_catalog_revision BIGINT,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (status <> 'eligible' OR (rights_basis <> 'unknown' AND length(btrim(review_notes)) > 0
    AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_catalog_revision IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS site_ad_eligibility_status_idx ON site_ad_eligibility(status);
-- Any catalog/source change withdraws prior eligibility. Traffic counters do not.
-- Monetization writes never write applications or increment its catalog revision.
CREATE OR REPLACE FUNCTION wz_invalidate_ad_review() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision IS DISTINCT FROM OLD.revision THEN
    UPDATE site_ad_eligibility SET status='unreviewed',reviewed_at=NULL,reviewed_by=NULL,
      reviewed_catalog_revision=NULL,revision=revision+1,updated_at=clock_timestamp()
      WHERE application_id=NEW.id AND status='eligible';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER wz_invalidate_ad_review AFTER UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION wz_invalidate_ad_review();
COMMIT;
