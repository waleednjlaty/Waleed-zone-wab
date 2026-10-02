# Phase 4 integration — Agent O

Integrates source PRs #32 (storage), #34 (metadata), then #33 (QA) in that order on `agent/phase4-integration`. Source PRs are not individually merged into main. No textual conflicts; semantic compatibility and security findings below are corrected in integration.

## Security review and integration corrections

- Server-only S3 registry requires complete configuration **and** explicit `DOWNLOAD_STORAGE_PROVIDER_VERIFIED=true`. This defaults false and is an operator attestation, not an automated provider probe. Missing/invalid config leaves an empty frozen registry. `DIRECT_DOWNLOADS_ENABLED=false` and ingress false remain defaults; shared DB settings, integrity, token/cooldown/binding/quota and current owner-verified budget remain independent gates.
- Real SDK authenticated exact-object HEAD and local SigV4 GET signing only; no network GET, APK buffer/stream/proxy or upload path is introduced. Actual HTTP/service tests verify no storage operations before redemption and an empty native 303 after validated redemption. Only the Location reveals the signed object key; public JSON/status/presentation, errors and persisted state do not reveal signed URLs or credentials.
- Trusted publisher SHA metadata must exactly match canonical key and DB hash/size/APK MIME. ETag never substitutes for SHA-256. Provider checksum mode now requires explicit FULL_OBJECT: omitted/unknown/composite types fail closed. Version-enabled providers now require an explicit pinned version; HEAD and GET must use the same version. Railway rejects invented versions.
- Runtime presentation/admission rejects missing keys, Railway versions, and known S3 keys whose UUID/hash differ from the selected file. Exact host/path/version/GET ownership validation, HTTPS, no URL userinfo/fragment/custom port, attachment response overrides, TTL 30–300s, aborts, timeouts, combined deadline and existing conservative circuit behavior remain enforced. Empty fragments are rejected too.
- Railway lacks versioning/locks. The metadata CLI can now stage verified Railway records with a null provider version, an exact `artifacts/<planned-file-uuid>/<sha256>.apk` key, local size/hash verification, scan evidence and an explicit publisher `immutable_key: true` no-overwrite assertion. This assertion does **not** prove cloud bytes, locks or permissions. Real no-overwrite publishing controls must be reviewed before canary. Generic versioned metadata still requires a real immutable provider version.
- CLI uses read-only dry-run, explicit apply + reviewed plan fingerprint, stale-plan rejection, serializable atomic apply, collision protection, immutable verified metadata, staged promotions and rollback. Filename validation now agrees with adapter attachment restrictions. Config-only disabled remains usable for quarantined/retired artifacts. Direct activation is **unconditionally blocked** in the CLI independently of conditional runtime registration; the old misleading 'registry always empty' blocker is removed.
- Production DB guard is unchanged: only an explicit literal-loopback `wz_metadata_test_<suffix>` connection, no DATABASE_URL fallback, remote host, URL override or implicit production authorization. No production migration/metadata flow is enabled.
- Legacy/unmigrated apps retain their existing contract; only explicit disabled config denies them. No schema or public frontend/SEO behavior is changed by this integration.

## Verification and reproducibility

Supported Node 20.19.5 with `npm ci`. Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:storage`, `npm run test:metadata`, `npm run test:downloads:strict`, and `npm run test:integration` with their documented disposable test environments.

`tests/storage-integrated-s3.cjs` adds actual S3 adapter/local SDK presigning over real service/HTTP/PGlite SQL, injecting only HEAD transport. It covers pre-redemption isolation, exact HEAD/native empty 303, quarantine on wrong size/MIME/missing or wrong SHA, UUID/key/version rejection and server/DB/adapter/withdrawal gates. Existing 82 storage QA cases and 24 adapter tests remain executable; provider mock Range/private-denial tests are explicitly not live-provider certification.

The existing GitHub integration workflow uses native disposable PostgreSQL 16 for multi-pool locking, 50 admission/redemption concurrency, quota/budget races and actual metadata transactions. The integrated full `npm test` job now supplies a separate metadata DB as well as the download DB; a dedicated metadata workflow also remains. Production API/security integration runs 45 checks, browser integration 24 flows and SEO 21 checks. Isolated download UI runs 18 scenarios including countdown/READY/429/expired/native POST at 360/768/1440px. Final green CI at the exact PR head is required before merge.

Locally, the container has only UID/GID 0 mapped and cannot run native PostgreSQL as a non-root user. `npm run test:integration` without a disposable DB fails its explicit guard. Native DB/security and production-catalog/browser evidence therefore comes from CI, not a claim of local native execution. Local UI Playwright Chromium checks and visual screenshot review execute independently; agent-browser's optional daemon exits at startup in this container, so Playwright is the documented fallback.

Production dependency audit is required in CI and checked locally. Exact direct dependencies: `@aws-sdk/client-s3@3.1145.0`, `@aws-sdk/s3-request-presigner@3.1145.0`. SDK imports are server-only; `.next/static` is inspected for provider credential names, fixture secrets and SDK code. No runtime dependency is added for temporary local test tooling.

## Remaining gates and stop point

Code/tooling/QA readiness does not mean live storage. No bucket, upload, billing/card/trial/plan change, production migration, production flag change or manual deployment is part of this integration.

Before a separately authorized storage canary:

1. Review and authorize the production metadata target/CLI workflow separately; retain its current production deny until then. Run additive migration only with reviewed backup/role/checksum ledger and explicit target authorization.
2. Verify actual provider credentials/permissions, private unsigned GET denial, URL style/host, exact HEAD SHA metadata, no-overwrite publishing policy and authentic scanner-reviewed canary bytes.
3. Verify every ingress hostname overwrites the chosen IP header; install independent HMAC keys and reviewed rotation settings.
4. Confirm owner-approved storage/traffic account budget and hard usage controls; install a current shared verified budget. No zero-cost/unlimited assumption.
5. Perform real-provider GET/Range/If-Range/206/416, resume/reconnect and expiry tests, attachment/MIME checks, and a real mobile native POST → 303 → storage download. Existing `form-action 'self'` CSP requires actual redirect compatibility validation; no broad relaxation is made here.
6. Only after evidence and explicit rollout authorization consider provider attestation, shared settings, canary app direct config and deployment enablement. Until then no signed URL is available through the site.

Stop after the final PR merge. No Admin Dashboard work or storage activation follows.

Primary references checked 2026-10-02: [Railway Storage Buckets](https://docs.railway.com/storage-buckets), [S3 HEAD/checksum semantics](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html), and [PostgreSQL serializable isolation](https://www.postgresql.org/docs/16/transaction-iso.html).
