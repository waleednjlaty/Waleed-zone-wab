# Phase 3 backend handoff — Agent G

Implements issue [#18](https://github.com/waleednjlaty/Waleed-zone-wab/issues/18) on the integrated Phase 2 baseline `7264a93`.
Requirements: [download specification](DOWNLOAD_SYSTEM_SPEC.md) and [free-tier plan](CLOUD_FREE_TIER_PLAN.md).

## Current activation state

**Disabled by default. No storage provider is implemented or provisioned.** The production adapter registry is deliberately empty. No APK/XAPK bytes are fetched, buffered or returned by Next.js. Only a successfully committed redemption returns a bodyless 303 to a validated provider URL. Existing catalog/search/auth/CTAs remain untouched.

The migration is a delivered file, not an applied production change. This PR does not create resources, add billing, start trials, change hosting or deploy. A later provider PR and the documented ingress/account/canary checks are still necessary to activate direct downloads.

## Endpoints for Agent H/J

All routes have Node runtime, dynamic rendering, private/no-store, no-referrer, nosniff and noindex headers, including errors and unsupported methods. Public JSON uses snake_case.

| Method/path | Input | Result |
|---|---|---|
| POST `/api/downloads/session` | JSON `{}`, exact Origin | CSRF token and host-only HttpOnly client cookie |
| POST `/api/downloads/requests` | JSON `{application_id,version_id,file_id}`, UUID `Idempotency-Key`, `X-CSRF-Token` | 201 new or 200 replay/deduplication, timing and same-origin status URL |
| GET `/api/downloads/requests/{request_id}` | Original client cookie and optional original login session | State/timing, never token or delivery URL |
| POST `/api/downloads/requests/{request_id}/token` | JSON `{}`, `X-CSRF-Token` | Opaque token after DB-enforced readiness; expires in at most 60s |
| POST `/api/downloads/redeem` | Native URL-encoded form `request_id`, `token`, `csrf_token` | Bodyless 303 after atomic consume; safe HTML errors, or JSON errors for `Accept: application/json` |
| POST `/api/downloads/control` | JSON `{enabled:false}`, owner session, client cookie and CSRF | Shared owner kill switch; cannot enable grants through this endpoint |

No CORS or query parameters are supported. Unsupported GET/HEAD/OPTIONS/PUT/PATCH/DELETE methods return 405 and Allow. Status GET never changes request state or cooldown. Never put the raw token in a GET URL or browser persistent storage.

Writes require the configured canonical Origin, same-origin Fetch Metadata when supplied, original client cookie and synchronizer CSRF verifier. Body size is streamed and capped at 2KiB; unknown fields and duplicate form fields fail. Production canonical origin must be HTTPS; forwarded/Host headers cannot change it. Production cookies use `__Host-` names and Secure; the client DB expiry is absolute seven days. Bootstrap rotates CSRF, so another tab may need to bootstrap again after a CSRF rejection.

Logged-in requests bind both client and user. Login/logout/account changes cannot take over an in-flight request. Another session of the same user shares the principal cooldown but gets a generic `DOWNLOAD_IN_PROGRESS` for a live request from the first browser; after expiry it can create its own. Authentication lookup errors propagate as 503, never anonymous success.

## State, timing and concurrency

Admission establishes a fresh DB-time `ready_at = created_at + 20s` and principal cooldown. Requests expire five minutes after readiness. One live request per principal is protected by a principal row lock. Same-file tabs deduplicate; each supplied idempotency alias is retained so terminal keys cannot create new grants. Different payload with the same key is 409. Each newly admitted request receives the full preparation interval.

Issuance is 425 with Retry-After before readiness. Up to three generations rotate the previous SHA-256 verifier, without extending request expiry/cooldown or double-reserving bytes. A fourth issuance atomically revokes the request. Token format is canonical `wzdl1_` plus 32 random base64url bytes. Raw client, CSRF and application secrets are never persisted.

Redemption validates binding/token before storage, runs HEAD/signing outside SQL transactions, then rechecks eligibility, token generation, expiration, object snapshot, budget and provider expiry under locks. One conditional update consumes the current token. COMMIT is awaited before disclosure. Response loss after commit leaves it consumed; status can report redemption but cannot reissue the URL.

Serving lock order: principal → network admission mutexes (admission only) → request → client → settings → application → config → version → file → budget. Fresh `clock_timestamp()` is captured after waits, including the final budget lock. Lock/statement deadlines are 1s/2s; errors fail closed. Attempt-limit transactions finish before lifecycle transactions. Owner disable only writes settings and does not acquire principal locks. Quarantine only writes the file outside the serving transaction.

All grant-producing operations repeat active/published checks for the application/version, direct-mode config and verified/active APK file with matching App→Version→File relationships. Incomplete or unsupported metadata/adapters deny delivery. Withdrawal or snapshot mismatch revokes the request lazily. Legacy shortener/Telegram URLs never become storage refs.

The schema intentionally supports verified **APK only** at launch, up to 2GiB; additional archive types need an explicit metadata/UX contract. Foreign keys preserve bot application IDs, Phase 2 user IDs, parent hierarchy and client/user retention. Catalog publishing is out of band; this backend supplies no publishing API or dashboard.

## Rate limits and trusted ingress

Shared PostgreSQL token buckets implement the specification's write, status, token, redeem and bootstrap policies. Admission also locks rolling principal/network quotas for 10m/1h/24h; new client creation is limited to 100/day per network. A separate ingress attempt bucket (capacity 40, refill 120/min/network) counts malformed and unauthenticated requests before body/identity work. Safe 429 responses carry ceiling-rounded Retry-After and retry_at; no user/IP/limiter keys leak.

`DOWNLOAD_INGRESS_VERIFIED=true` and `DOWNLOAD_TRUSTED_IP_HEADER` require an operator-tested single-IP header overwritten by the actual ingress. The default refuses unknown ingress, missing/malformed IPs and Forwarded/X-Forwarded-For chains. Never set this flag merely because a header exists. IPv4-mapped IPv6 normalizes to IPv4; real IPv6 is grouped by /64. Network identifiers are dedicated-key HMACs, never raw IPs. During a 24h key rotation, configure both keys and an absolute overlap deadline; old/new buckets are both enforced and admission counts their union.

## Budget and storage contract

`site_download_budget` must have an owner-confirmed, unexpired fixed period, verified allowance, conservative byte limit, factor at least 2, and maximum outstanding authorizations. There is no assumed provider entitlement, automatic period reset or refund API. Issuance reserves full file size times the factor under the global budget lock; rotations reuse the same reservation. Successful redemption rechecks the budget period, including its reservation's period identity. A reservation from an old period cannot authorize a new-period disclosure. Keep reservations until operator reconciliation; reset periods only after reconciling active grants and real provider traffic.

The outstanding-grant cap counts live reserved requests and delivery URLs until their deadlines. Byte exhaustion/unverified period stops tokens with 503; concurrent capacity denial is 429. Reservations are conservative admission accounting, **not a hard bound on reusable delivery URL traffic**. Actual provider/account hard limits and telemetry must be verified before activation; leaked URLs/range retries can exceed reservations.

`DownloadStorage` requires HEAD, exact-object GET grant signing, AbortSignal support and adapter-specific URL/object validation. HEAD must expose a trusted checksum, pinned version (when used), size and MIME; ETag is not accepted as SHA-256. A mismatch quarantines the file. All URLs must be HTTPS, exact allowlisted hostname, no credentials/fragment/custom port, exact immutable object and effective TTL between 30s and 300s. Signing is side-effect free or idempotent by request ID. Initial local guard: two preparations per process, three-second total deadline, ten-second circuit breaker for storage faults. Shared limits and byte reservations remain authoritative across instances.

Providers must independently pass private-origin, unsigned denial, GET-only, Range/resume, attachment/MIME, expiry, quota and canary checksum tests. These are pending because this PR implements an interface only.

## Explicit migration and validation

1. Inventory/backup the existing database and Phase 2 auth tables. `applications` and `site_users` must exist. Use a migration role, not the web runtime role.
2. Apply `npm run migrate:downloads` with the explicitly selected staging/production DATABASE_URL. The checksum ledger and advisory transaction lock prevent concurrent/repeated migration drift. No request-time DDL or deployment hook is added.
3. Existing applications are backfilled to legacy mode; settings are false and no budget/provider allowance is invented. New bot applications without config remain unavailable for direct download.
4. A later authorized canary release supplies verified immutable files, config rows, fixed budget, adapter and verified ingress. Both deployment and shared settings gates must be true. Turning the shared flag off stops new grants; already disclosed URLs require provider revocation or expiry.
5. Keep requests, alias keys and quota events at least 48h. An operator maintenance task must prune expired terminal records in bounded batches using principal→request lock order, clear pointers, remove alias keys first, and only then delete unreferenced clients/principals. Never shorten the quota horizon, reset the budget as cleanup, or run destructive rollback while grants remain active. No cloud scheduler is provisioned here.

Validation commands:

```sh
npm run typecheck
npm test
npm run build
# Local dedicated database only; tests create/drop their own random schema.
WZ_DOWNLOAD_TEST_DATABASE_URL=postgres://user:password@127.0.0.1:5432/wz_phase3_test npm run test:downloads
```

The download test suite uses a real PostgreSQL service with independent pools plus a metadata/signing fixture that never sends file bytes. The normal unit command skips database cases unless its dedicated local URL is provided. The existing CI PostgreSQL service runs the database cases on PostgreSQL 16 without another cloud resource. Tests cover readiness boundaries, cooldown, key aliases, concurrent admission/consume/budget/quota contention, token rotation/expiry/replay, multi-session binding, withdrawal during signing, fail-closed auth, CSRF/direct API abuse, 429/Retry-After, owner disable and metadata quarantine. Provider/production ingress behavior and browser redirects under the existing CSP remain release checks for the later integration/provider work.

Implementation references: [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html), [database time functions](https://www.postgresql.org/docs/current/functions-datetime.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers).
