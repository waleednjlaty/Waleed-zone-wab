# Phase 4 file/version metadata operator CLI

Scope: manage `site_download_versions`, `site_download_files`, and `site_download_app_config`
using reviewed JSON manifests. No admin dashboard, frontend, SEO, upload, provider API,
bucket creation, automatic migration, application/bot edits, deletion, or global enable.

**This phase only permits disposable, local PostgreSQL.** The CLI refuses remote hosts,
`localhost` DNS resolution, URL query overrides, and database names outside
`wz_metadata_test_<suffix>`. It reads only `DOWNLOAD_METADATA_DATABASE_URL`; it never falls
back to `DATABASE_URL`. Do not use a tunnel/forwarding proxy pointing at production.
The name/host guard prevents ordinary mistakes; it cannot prove that someone has not
deliberately put production data behind a loopback port. A separate authorization and
reviewed target-guard change are required before staging/production use.

## Prepare a disposable database

Use Node 20.19.5 and `npm ci`. Start your own disposable PostgreSQL 16 instance/container,
binding only to `127.0.0.1`; create an empty uniquely named database, for example
`wz_metadata_test_canary_001`. Never reuse a production catalog or a prior test database.
For a standalone fixture, prepare prerequisite `applications` and `site_users` tables
with synthetic data, then apply `migrations/001_downloads.sql` explicitly. The native test
below prepares these tables itself and refuses a non-empty public schema.

The existing migration runner (`npm run migrate:downloads`) uses an explicit
`DATABASE_URL` and a checksum ledger. If exercising it, point that command at your
disposable database only. The metadata CLI never invokes it or runs DDL. No migration
is attached to install, build, deployment, or request handling. See
`docs/PHASE3_INTEGRATION_REVIEW.md` for the separately authorized migration/backup policy.

```sh
export DOWNLOAD_METADATA_DATABASE_URL='postgres://postgres:local-test-only@127.0.0.1:5432/wz_metadata_test_canary_001'
npm run metadata:downloads -- --help
```

Use a dedicated role with SELECT on applications/settings/budget, SELECT/INSERT/UPDATE
on the three metadata tables, and the lock privileges needed for the reviewed apply
transaction. Do not give the CLI cloud credentials. Production credentials are not
needed. Read-only dry-runs also work with a SELECT-only role.

## Manifest contract

Start with `examples/download-metadata.pending.json`. Its ID, size, SHA and object
reference are **placeholders**, not verified software. Replace every artifact field
with authentic metadata. One manifest selects one application, release, and variant.
Additional variants require their own reviewed operation. Missing `file_state` and
`version_state` default to `pending`; omitted `config_mode` preserves an existing
selection, or creates a `legacy` config for a newly added legacy application.

| Field | Contract |
| --- | --- |
| `schema_version` | Exactly integer `1`; unknown fields rejected |
| `application_id` | Existing application, integer 1–2147483647 |
| `version_label` | 1–100 characters, no controls/formatting characters or surrounding whitespace |
| `release_key`, `variant_key`, `storage_backend` | 1–100 lowercase ASCII letters/digits/dot/underscore/hyphen, starting with a letter/digit |
| `artifact_type` | Exactly `apk` |
| `size_bytes` | JSON integer 1–2147483648, no strings/floats |
| `sha256` | Exactly 64 lowercase hexadecimal characters; ETags are not SHA-256 |
| `mime_type` | Exactly `application/vnd.android.package-archive`, no parameters |
| `download_filename` | 1–180 characters, `.apk` suffix, no slash/backslash, hidden name, controls or bidi formatting |
| `storage_key` | Relative ASCII object key, 1–512 characters; no traversal, URL, encoded path, empty segment, query or signature |
| `storage_object_version` | Required field: `null` while pending, or nonempty immutable provider version up to 200 characters; verified/active require non-null |
| `file_state` | `pending`, `verified`, `active` |
| `version_state` | `pending`, `active`, `published` |
| `config_mode` | Optional `legacy`, `disabled`, `direct` |
| `verification` | Required for verified/active: exactly `scanner`, `scan_reference`, `scanned_sha256`; SHA must match artifact |

The CLI streams the local artifact to check exact size and SHA-256; it never uploads it.
MIME/extension validation is metadata validation, not an APK signature/package audit.
`verification` is an **operator assertion** about a completed external malware/release
review. The CLI does not run a malware scanner, certify a file is safe, HEAD a cloud
object, or prove the object version exists. Review the scanner report and confirm that
the provider object/version contains the same bytes independently before using real
metadata. Use truthful evidence; fixture assertions prove only tooling behavior.

Example evidence for a verified manifest:

```json
{
  "file_state": "verified",
  "version_state": "pending",
  "verification": {
    "scanner": "name-and-version-of-scanner-used",
    "scan_reference": "private-report-reference",
    "scanned_sha256": "the-same-64-lowercase-hex-digest-as-sha256"
  }
}
```

This fragment must be merged into the full manifest. No scan-report column exists in
`001_downloads.sql`; evidence appears in the reviewed plan/output, while the database
stores `scan_status` and `verified_at`. Keep the manifest, report, dry-run plan and
successful apply output in a private operator audit record. Never commit private
reports, credentials, signed URLs, or operational object keys into a public PR.

## Review and apply

```sh
npm run metadata:downloads -- --manifest ./private-manifest.json --dry-run
# Review before/after, changes, blockers and plan_sha256, then paste that exact hash:
npm run metadata:downloads -- --manifest ./private-manifest.json --apply --expect-plan <plan_sha256>
```

Without `--apply`, the transaction is PostgreSQL `READ ONLY` / repeatable read; there
are no temporary writes or rollback-based pretend dry-runs. `--apply` requires the
exact plan SHA, and re-computes it in a serializable transaction with a transaction
advisory lock, metadata table/row locks, and an application row share lock. Relevant
concurrent edits, changed flags or evidence invalidate the review. On lock timeout,
serialization failure, collision or constraint failure, the entire transaction
rolls back. Run a new dry-run and review; do not blindly retry a stale hash.

The plan hash binds the connected database name, app eligibility, before/after
metadata/config, scan assertion, and edit flag. It is a review fingerprint, not a
signature or an authorization substitute. New UUIDs are deterministic from the
application/release/variant; existing UUIDs are preserved. Natural uniqueness is
also enforced by the migration. Re-running an already applied manifest with a newly
reviewed no-op plan leaves rows and timestamps unchanged. Replaying the **old**
pre-write plan is rejected because its before-state changed.

Exit codes: `0` successful dry-run/apply/help, `1` validation/DB/plan/apply failure,
`2` dry-run with direct activation blockers. Output is operator-only JSON including
private metadata; do not expose it as a public API. Driver errors show an error code,
not SQL/connection secrets. JSON/manifest parse errors can contain input context, so
never place secrets in a manifest. Stdout success is emitted only after commit.

## Canary metadata lifecycle

1. **Pending:** insert file/version inactive and unpublished. Keep config `legacy`
   or `disabled`. Choose a new release/object key rather than replacing live bytes.
2. **Verify:** keep version pending, set file `verified`, add truthful scan evidence
   and immutable object version. Use `--verify-file ./reviewed.apk` for both dry-run
   and apply. Match bytes to the scanner report and independently confirmed object.
3. **Activate:** set file `active` and version `active`; keep config unchanged.
   Local bytes/evidence are required again. `published` remains false.
4. **Publish metadata:** keep file active, set version `published`; application must
   already be active and published. All active sibling variants must also be verified
   immutable non-retired objects. Publication stamps `published_at` once.
5. **Direct selection:** accepted as a requested config mode, but dry-run reports
   blockers and apply rejects it in this Phase 4 tool. No canary real delivery occurs.

New files must start pending. Pending cannot jump straight to active; versions cannot
jump straight to published. Verification stamps `verified_at` once. State downgrades,
reviving quarantined/failed/retired files, and destructive replacement are rejected.
An existing verified/active artifact's bytes, SHA, size, key, object version, filename,
MIME and backend are immutable through this CLI. Existing pending metadata edits and
inactive/unpublished version label edits require `--allow-pending-update` on **both**
dry-run and apply. A pending edit must precede verification when assigning an object
version. Use a new release for additional variants after publication.

For reviewed config changes, include `config_mode: "disabled"` or `"legacy"` with
the existing exact artifact/version states. `disabled` denies application downloads;
`legacy` restores the existing legacy route behavior. The current version pointer is
retained in these modes, and the legacy catalog/link is not edited. Omit the field to
preserve the selection. There is no delete/drop/reset/force/downgrade option.

For a config-only operation, including emergency disable when a file is quarantined
or retired, use `examples/download-config.disabled.json` and `--config-only`:

```sh
npm run metadata:downloads -- --config-only --manifest ./private-config.json --dry-run
npm run metadata:downloads -- --config-only --manifest ./private-config.json --apply --expect-plan <plan_sha256>
```

This separate manifest accepts only `schema_version`, `application_id`, `config_mode`,
and (for `direct` only) `release_key`. It never edits files or versions, does not need
local bytes or scan evidence, and rejects `--verify-file`/`--allow-pending-update`.
Both disabled and legacy preserve the existing current version pointer. Direct
selection validates current app/version/file eligibility and remains blocked by the
same separately reviewed rollout requirement. Config-only no-ops preserve timestamps.

## Direct rollout remains blocked

The production registry in `src/lib/downloads/storage.ts` is empty. No manifest flag
can manufacture a trusted adapter. The CLI also reports missing shared settings and
owner-confirmed current budget. Provider/immutable-object/private-origin/Range/expiry,
verified ingress and real mobile redirect/CSP compatibility need a separately reviewed
storage rollout, as documented by the Phase 3 review. The conservative direct deny
must be revised alongside that implementation; merely wiring an adapter elsewhere
will not silently unlock this CLI. Tests using fixture rows are not provider evidence.

The tool never writes settings, budget, requests, grants or quota counters, never sets
`DIRECT_DOWNLOADS_ENABLED=true`, and never reads cloud credentials. A published active
metadata row is not sufficient to start downloads. Emergency response is an explicitly
reviewed `disabled` config; preserve metadata/history. Global operational controls and
production migrations remain outside this task.

## Tests (disposable native PostgreSQL only)

```sh
export WZ_METADATA_TEST_DATABASE_URL='postgres://postgres:local-test-only@127.0.0.1:5432/wz_metadata_test_fresh_001'
npm run test:metadata
npm run typecheck
npm test
npm run build
```

The native suite uses the actual `001_downloads.sql`, two independent pools and a
tiny inert artifact. It refuses non-empty public tables and unsafe URLs before setup,
retains the uniquely named disposable DB for inspection, and never drops a catalog.
Coverage includes schema/size/SHA/MIME/path/unknown fields, no-op timestamps,
read-only dry-run, pending edits, local bytes/scan binding, staged promotions,
publication eligibility, stale plans, immutable metadata, quarantine/retirement,
config preservation/rollback, collision, concurrent inserts, atomic DB failure, and
unchanged legacy/settings/budget data. The dedicated CI workflow supplies PostgreSQL
16. Without the test DB variable, only the native suite is skipped; such an invocation
is not sufficient evidence for this task. Use a fresh DB for each native run.

PostgreSQL references: [read-only transactions](https://www.postgresql.org/docs/16/sql-set-transaction.html),
[transaction advisory locks](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS),
[serializable isolation](https://www.postgresql.org/docs/16/transaction-iso.html).
