-- Operator-run only. Existing query pattern: public newest-first pages and category filters.
-- CONCURRENTLY must run outside a transaction. Do not run on app startup.
-- Same names as the earlier optional catalog-indexes script; no duplicate indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS applications_public_id_idx
  ON applications (id DESC) WHERE active=true AND published=true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS applications_public_category_id_idx
  ON applications (category,id DESC) WHERE active=true AND published=true;
