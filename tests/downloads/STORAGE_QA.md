# Phase 4 storage QA — Agent N

Issue [#30](https://github.com/waleednjlaty/Waleed-zone-wab/issues/30). Baseline:
`1581874aab782b5e853ba097b76537f5f062927f` (integrated Phase 3 main).
Only tests and test documentation change. No production seam, adapter, dependency,
configuration, database migration, cloud resource, deployment or merge is added.

## Run

Use repository-supported Node 20.19.5:

```sh
node --test tests/storage*.cjs
WZ_DOWNLOAD_CONTRACT_STRICT=1 npm test
npm run typecheck
npm run lint
npm run build
```

The existing `npm test` glob includes all three new suites automatically. The
existing CI additionally supplies disposable native PostgreSQL and runs the
production-server integration/browser checks. No CI workflow change is needed.

## Coverage: 82 new executable tests

| Suite | Tests | Evidence |
| --- | ---: | --- |
| `tests/storage.cjs` | 54 | Actual `prepareDelivery`/`validateGrant`: HEAD before signing; exact bigint size (including adjacent bytes above Number precision), exact APK MIME, SHA-256 equality/mismatch/missing/ETag rejection; object version required when specified and optional otherwise; exact ref passed to HEAD and signing; safe filename; TTL 30–300s at millisecond boundaries; invalid/expired dates; HTTPS, credentials, fragments, custom ports, exact allowed host and declared host; preserve signed URL string; reject wrong key/prefix/suffix/version/expiry via adapter correspondence; safe errors; 404 and integrity failures distinguished from outage; one total 3s deadline with AbortSignal in both stages; noncooperating provider bounded; timers cleared; 10s circuit and recovery; two-preparation resource guard and slot release. |
| `tests/storage-service.cjs` | 11 | Actual HTTP handlers, `DownloadService`, migration and SQL on disposable PGlite: no HEAD/signing in presentation/admission/countdown/status/token; only empty native 303 after redemption; exact metadata/signing input; no signed URL persisted/recovered; checksum/size/MIME/version mismatches quarantine/deactivate only affected file and do not consume token; later redemption denied; wrong-object/wrong-version/expired URL do not disclose or consume; valid metadata is not quarantined for signing failure; final DB-time TTL revalidation; safe permission-outage response/circuit/retry; actual rate limit still applies to recovery. |
| `tests/storage-provider-contract.cjs` | 17 | **Mock boundary expectations only**: unsigned/private GET and HEAD denial; signed GET with attachment and APK MIME; GET signature rejects HEAD/POST/PUT/DELETE/OPTIONS/PATCH; repeat/range/retry with the same URL and different unsigned Range headers; exact Content-Range and inert byte reconstruction; 416 for unsatisfiable range; tampered key/version/MIME/disposition denied; 30s/300s expiry permits initiation 1ms before and denies new GET/resume at exact expiry; started response can finish; pre-aborted signal blocks mock HEAD/signing. |

`runtime-adapter.cjs` now accepts an optional **test-only** `storageAdapter` and
returns persisted file rows for quarantine assertions. Its original default
provider and all production logic remain in use for existing Phase 3 scenarios.
No rate limiter is disabled in any new scenario. PGlite serializes SQL; these
tests do not replace the existing native multi-pool concurrency suite.

## Isolation and interpretation

Each worker invokes `blockExternalIO()` before storage/service execution: remove
provider/DB environment variables; block fetch, HTTP(S), TCP, UDP and subprocesses.
The provider fixture uses an in-process HMAC model and a **49-byte inert text
buffer**, not an APK. `.test` URLs are never resolved or followed. Next.js is
checked through actual handler responses and dependency calls, with real network
attempts prohibited. Storage body/range assertions invoke only the mock boundary,
never Next.js, Railway, a real bucket or an external signed URL.

The 82 tests are behavioral coverage, not a percentage for the entire application.
The TypeScript test loader transpiles modules without source maps and storage is
reloaded to isolate module-local circuit state; Node's raw V8 percentages are not
a reliable source-level coverage measure here. No source percentage is claimed.

## Provider integration gates remain open

The baseline has an empty production adapter registry. Passing the HMAC model
does **not** prove S3 SigV4 correctness, authenticated provider HEAD, trusted
checksum encoding, Railway permissions/private-origin configuration, provider
URL correspondence, real expiry, real Range support, mobile behavior or pricing.

Agent L's actual adapter must be tested separately with its mocked S3 transport:
assert authenticated exact-key/version HEAD, trusted SHA-256 normalization (never
ETag), GET-only signing, effective expiry matching signed parameters, response
header overrides, exact-object matching and abort/error translation. Run the
delivery expectations against a separately authorized non-production provider
canary before activation; this PR neither makes such traffic nor authorizes it.

Keep direct downloads disabled until provider and integration gates pass. A
successful 303 proves URL disclosure only, not a completed transfer or an egress
budget guarantee. Resume after expiry/renewal is not promised.
