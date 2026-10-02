-- Additive only. Requires the existing applications and Phase 2 site_users tables.
-- Apply explicitly with scripts/migrate-downloads.mjs; handlers never execute DDL.
CREATE TABLE site_download_settings (
  id SMALLINT PRIMARY KEY CHECK(id=1), enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), updated_by TEXT
);
INSERT INTO site_download_settings(id) VALUES(1);
CREATE TABLE site_download_versions (
  id UUID PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  version_label TEXT NOT NULL CHECK(length(version_label) BETWEEN 1 AND 100), release_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false, published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), published_at TIMESTAMPTZ,
  UNIQUE(application_id,release_key), UNIQUE(application_id,id)
);
CREATE TABLE site_download_app_config (
  application_id INTEGER PRIMARY KEY REFERENCES applications(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL DEFAULT 'legacy' CHECK(mode IN ('legacy','direct','disabled')),
  current_version_id UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(application_id,current_version_id) REFERENCES site_download_versions(application_id,id)
);
INSERT INTO site_download_app_config(application_id) SELECT id FROM applications;
CREATE TABLE site_download_files (
  id UUID PRIMARY KEY, version_id UUID NOT NULL REFERENCES site_download_versions(id) ON DELETE RESTRICT,
  variant_key TEXT NOT NULL, artifact_type TEXT NOT NULL DEFAULT 'apk' CHECK(artifact_type='apk'),
  size_bytes BIGINT NOT NULL CHECK(size_bytes>0 AND size_bytes<=2147483648),
  mime_type TEXT NOT NULL CHECK(mime_type='application/vnd.android.package-archive'),
  download_filename TEXT NOT NULL CHECK(length(download_filename) BETWEEN 1 AND 180
    AND download_filename !~ '[[:cntrl:]/\\]' AND download_filename LIKE '%.apk'),
  sha256 TEXT NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), storage_backend TEXT NOT NULL,
  storage_key TEXT NOT NULL CHECK(length(storage_key) BETWEEN 1 AND 512), storage_object_version TEXT,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','verified','quarantined','failed')),
  verified_at TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT false,
  retired_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(version_id,variant_key), UNIQUE(version_id,id), UNIQUE(storage_backend,storage_key),
  CHECK(scan_status<>'verified' OR verified_at IS NOT NULL)
);
CREATE TABLE site_download_clients (
  id UUID PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  csrf_hash TEXT NOT NULL CHECK(csrf_hash ~ '^[a-f0-9]{64}$'), network_hashes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at>created_at)
);
CREATE TABLE site_download_principals (
  key TEXT PRIMARY KEY, next_download_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity',
  active_request_id UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Owner-confirmed fixed budget period. No automatic reset or invented provider allowance.
CREATE TABLE site_download_budget (
  id SMALLINT PRIMARY KEY CHECK(id=1), starts_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  allowance_verified BOOLEAN NOT NULL DEFAULT false, byte_limit BIGINT NOT NULL DEFAULT 0 CHECK(byte_limit>=0),
  reserved_bytes BIGINT NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0),
  amplification_factor INTEGER NOT NULL DEFAULT 2 CHECK(amplification_factor BETWEEN 2 AND 10),
  max_outstanding INTEGER NOT NULL DEFAULT 2 CHECK(max_outstanding BETWEEN 1 AND 20),
  CHECK(expires_at>starts_at), CHECK(reserved_bytes<=byte_limit)
);
CREATE TABLE site_download_requests (
  id UUID PRIMARY KEY, principal_key TEXT NOT NULL REFERENCES site_download_principals(key),
  client_id UUID NOT NULL REFERENCES site_download_clients(id) ON DELETE RESTRICT,
  user_id TEXT REFERENCES site_users(id) ON DELETE RESTRICT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  version_id UUID NOT NULL, file_id UUID NOT NULL,
  FOREIGN KEY(application_id,version_id) REFERENCES site_download_versions(application_id,id),
  FOREIGN KEY(version_id,file_id) REFERENCES site_download_files(version_id,id),
  file_snapshot TEXT NOT NULL, idempotency_key UUID NOT NULL, payload_hash TEXT NOT NULL,
  network_hashes TEXT[] NOT NULL, created_at TIMESTAMPTZ NOT NULL, ready_at TIMESTAMPTZ NOT NULL,
  request_expires_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','issued','redeemed','expired','revoked')),
  token_hash TEXT UNIQUE, token_generation INTEGER NOT NULL DEFAULT 0 CHECK(token_generation BETWEEN 0 AND 3),
  token_expires_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ, delivery_expires_at TIMESTAMPTZ,
  reserved_bytes BIGINT NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0), budget_starts_at TIMESTAMPTZ, failure_code TEXT,
  UNIQUE(principal_key,idempotency_key), CHECK(ready_at>=created_at), CHECK(request_expires_at>ready_at),
  CHECK(token_expires_at IS NULL OR token_expires_at<=request_expires_at),
  CHECK(state<>'issued' OR (token_hash IS NOT NULL AND token_expires_at IS NOT NULL)),
  CHECK(state<>'redeemed' OR (consumed_at IS NOT NULL AND delivery_expires_at IS NOT NULL))
);
ALTER TABLE site_download_principals ADD FOREIGN KEY(active_request_id) REFERENCES site_download_requests(id) ON DELETE RESTRICT;
-- Alias keys from same-file multi-tab deduplication must remain terminal too.
CREATE TABLE site_download_idempotency (
  principal_key TEXT NOT NULL REFERENCES site_download_principals(key), key UUID NOT NULL,
  payload_hash TEXT NOT NULL, request_id UUID NOT NULL REFERENCES site_download_requests(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(principal_key,key)
);
CREATE TABLE site_download_limit_state (
  key TEXT PRIMARY KEY, tokens DOUBLE PRECISION NOT NULL CHECK(tokens>=0),
  updated_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE site_download_mutex (key TEXT PRIMARY KEY);
CREATE INDEX site_download_requests_principal_time ON site_download_requests(principal_key,created_at);
CREATE INDEX site_download_requests_network ON site_download_requests USING GIN(network_hashes);
CREATE INDEX site_download_requests_time ON site_download_requests(created_at);
CREATE INDEX site_download_requests_file_state ON site_download_requests(file_id,state);
CREATE INDEX site_download_requests_client ON site_download_requests(client_id,request_expires_at);
CREATE INDEX site_download_clients_network ON site_download_clients USING GIN(network_hashes);
CREATE INDEX site_download_clients_created ON site_download_clients(created_at);
CREATE INDEX site_download_files_version ON site_download_files(version_id);
CREATE INDEX site_download_versions_application ON site_download_versions(application_id);
