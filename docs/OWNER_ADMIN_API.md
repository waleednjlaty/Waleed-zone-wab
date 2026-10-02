# Owner administration API — Agent P

Issue: [#40](https://github.com/waleednjlaty/Waleed-zone-wab/issues/40). Built from Phase 4 main `de173ad`.

This is the backend foundation only. Existing `OWNER_USER_ID` session authorization remains authoritative. No UI, schema migration, request-time download DDL, provisioning, artifact upload/proxy, signing, provider calls, credentials response or deployment enablement is introduced. `applications` is read-only and remains bot-owned.

## Routes and contract

Every route is Node runtime, dynamic, owner-only, private/no-store and noindex. Read lists use bounded keyset pagination: `limit` defaults 50 (maximum 100); `after` is the previous `next_after`. Unknown/duplicate query fields are rejected.

| Route | Methods | Contract |
| --- | --- | --- |
| `/api/admin/session` | GET | Return session-bound CSRF token and expiry (15 minutes). |
| `/api/admin/catalog` | GET | List IDs, names, legacy display version/size/category/platform, active/published flags. Includes drafts. Numeric `after`. No bot delivery URLs/private fields. |
| `/api/admin/downloads/versions` | GET, POST | GET requires `application_id`; UUID `after`. POST `{application_id, version_label, release_key}` creates a pending version; exact natural-key retries return its existing identity. |
| `/api/admin/downloads/versions/{version_id}` | GET, PATCH | PATCH `{expected_revision, version_label}` for draft-only label edits, or `{expected_revision, action}` with `activate`, `publish`, `withdraw`. |
| `/api/admin/downloads/files` | GET, POST | GET requires `version_id`; UUID `after`. POST `{id, version_id, metadata}` creates pending/inactive metadata. Caller generates a UUID to bind the exact storage key. Exact retries preserve identity. |
| `/api/admin/downloads/files/{file_id}` | GET, PATCH | PATCH `{expected_revision, action}` with `activate`, `deactivate`, `quarantine`, `retire`; `edit` additionally requires complete `metadata`. |
| `/api/admin/downloads/config/{application_id}` | GET, PUT | PUT `{expected_revision, mode, current_version_id}`. `legacy`/`disabled` require null version and clear previous selection. `direct` is recognized but always returns `409 ROLLOUT_BLOCKED`. |
| `/api/admin/downloads/status` | GET | Shared/deployment flags, activation block, read-only configured reservation budget and remaining bytes. |
| `/api/admin/downloads/control` | GET, POST | GET same status view. POST `{enabled:false}` immediately disables shared settings and records owner ID/time. Enabling returns `409 ROLLOUT_BLOCKED`. |

Other methods return 405 with `Allow`. Successful operations return 200, including idempotent creation retries. There is no physical DELETE: withdraw/quarantine/retire preserve request foreign keys and history. Lists/items expose an opaque `revision`; PATCH/PUT require `expected_revision` from the latest read. A stale revision yields 409; refetch before retrying. Do not blindly retry a stale write. The emergency disable endpoint deliberately needs no revision and remains idempotent.

File `metadata` has exactly these required fields:

```json
{
  "variant_key": "universal",
  "artifact_type": "apk",
  "size_bytes": 100,
  "sha256": "<64 lowercase hexadecimal characters>",
  "mime_type": "application/vnd.android.package-archive",
  "download_filename": "application.apk",
  "storage_backend": "railway-s3",
  "storage_key": "artifacts/<the exact file UUID>/<the exact sha256>.apk",
  "storage_object_version": null
}
```

Only `railway-s3`/`s3` backends are accepted. Railway requires null provider version. S3 may be staged with null but cannot activate without a real non-null pinned version (the string `null` is rejected). Size must be an integer 1–2147483648; exact APK MIME/type, SHA format, filename/header safety, canonical UUID/hash object binding, text/control-character limits and unknown-field rejection are enforced. File responses omit SHA, storage key and provider version; they show `checksum_present`, verification/retirement status and revision. Editing a pending file requires supplying its complete original metadata from the publisher's manifest, not recovering sensitive identity from the API response.

## State and rollout protection

- New files are always pending/inactive. The API cannot assert `verified`, a scan result, `verified_at`, or publisher evidence. Real scanning, local-byte verification, trusted publisher SHA and immutable/no-overwrite evidence remain an out-of-band reviewed publisher workflow. The Phase 4 CLI's disposable-target/production deny guard is unchanged. Production verification cannot be performed through this API and still needs separately authorized tooling.
- Pending metadata may be edited only on an inactive/unpublished version. Verified/quarantined/failed/retired files cannot be edited or revived through metadata writes. Verification timestamps and prior publication timestamps remain evidence after withdrawal.
- File activation requires an already verified, non-retired immutable canonical artifact. Version activation requires at least one active file and all active files verified/immutable. Publication additionally requires an active version and an active, published bot-owned application. Activation/publication changes metadata only; it does not select direct mode or enable downloads.
- Quarantine/deactivation/retirement and version withdrawal invalidate runtime eligibility; legacy/disabled config is usable even with invalid artifacts. Existing download service rechecks eligibility before token/grant disclosure. Already disclosed external grants expire at their existing TTL; database controls cannot revoke provider URLs retroactively.
- Direct config and shared-setting activation are independently denied, even if someone separately changes deployment flags/provider credentials. This PR never changes `DIRECT_DOWNLOADS_ENABLED` or budget rows.
- Budget values are decimal strings to preserve BIGINT precision. They represent the existing configured reservation ledger, not live provider billing, certified account allowance, a spending guarantee or an automatic reset. Missing budget returns null; missing settings/schema fails closed.

## Request security and failures

Every supported request calls `authorizeOwnerRequest(request, false)` and `requireOwner()`. Ordinary users, absent/misconfigured ownership, stale sessions and `WEBSITE_STATS_TOKEN` cannot authorize administration. The existing auth implementation is reused unchanged, including its auth-table bootstrap behavior; the new download/admin service executes no DDL.

Configure an explicit canonical `NEXT_PUBLIC_SITE_URL` (HTTPS in production). Missing/invalid configuration disables admin requests. The guard never derives trusted origin from Host/Forwarded/request URL. Writes require exact `Origin`, an acceptable `Sec-Fetch-Site` when supplied, JSON and `X-CSRF-Token` obtained from the owner session route. A request also needs one canonical opaque session cookie (`__Host-wz_session` in production); duplicate/malformed cookies are denied. Reads reject foreign Origin/Fetch Metadata when present and never enable CORS.

The CSRF token contains a random nonce and short expiry, authenticated with HMAC-SHA256 under the existing cryptographically random session secret, bound to owner ID and canonical origin. The session secret is never returned. A token from another session/owner/origin, an expired/future token or an altered token fails constant-time verification. No new auth secret, cookie, persistence table or process-local session state is needed. Token renewal has no effect on other still-valid tabs. JSON payloads are bounded to 2048 actual streamed bytes independently of Content-Length; unsupported media, unknown fields and query tokens are denied.

Read transactions are repeatable-read/read-only. Writes are serializable, use the Phase 4 metadata advisory lock `748031004`, table/row locks and short lock/statement timeouts. Constraint/serialization conflicts return safe 409; retry with current state. Missing tables/columns return safe 503 `ADMIN_SCHEMA_UNAVAILABLE`; other unexpected database/provider/auth failures expose no SQL, URLs, credentials or stack traces. Existing session resolution converts auth lookup outages to absent identity, so those return owner denial (401), never anonymous admin access. Download tables are preflighted on every service transaction; missing schema is never silently repaired. 503 includes Retry-After 10 seconds.

The API follows [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) on session binding, custom-header tokens and origin defense in depth. It does not rely on hiding a UI or SameSite alone.

## Verification

`tests/admin-owner-api.cjs` executes all nine real route exports and the existing authorization helpers against real PostgreSQL SQL in isolated PGlite. Only Next cookie context, DB transport and notFound are test adapters; no production DB/cloud/network I/O is permitted. It covers owner denial on every read/write route, stats-token denial, session/owner expiry and failures, CSRF tampering/binding/expiry, origin and spoofed forwarding, actual-stream body limits, method/query rejection, keyset pagination, idempotent create, stale revisions, exact object validation, forged verification rejection, immutable metadata, state transitions, quarantine/retirement, direct/enabling deny, BIGINT budget precision, missing tables and bot-owned row preservation.

`tests/admin-owner-concurrency.cjs` additionally runs in existing CI's guarded disposable native PostgreSQL `WZ_DOWNLOAD_TEST_DATABASE_URL`, in its own isolated schema, with four connections. It checks identity preservation for competing creates, exactly one successful stale-revision edit, serialization-safe conflicts and the shared CLI advisory lock. PGlite serializes transactions and is not evidence of native multi-connection locking. Without that explicit native test URL, the concurrency test is marked skipped.

Run `npm run typecheck`, `npm test`, `npm run build`. No production migration or storage rollout is part of validation.
