-- Apply separately with psql; CONCURRENTLY cannot run inside a transaction.
-- Additive indexes only. No columns or publisher/bot data are changed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS applications_public_id_idx
  ON applications (id DESC) WHERE active = true AND published = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS applications_public_category_id_idx
  ON applications (category, id DESC) WHERE active = true AND published = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS applications_public_developer_idx
  ON applications (developer) WHERE active = true AND published = true;
