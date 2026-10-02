# Agent J — Phase 3 download contract tests

Issue: [#21](https://github.com/waleednjlaty/Waleed-zone-wab/issues/21).
## Agent K integration

The runtime adapter is connected. All original 97 scenarios plus three public-metadata/provider-gate regressions execute the real `createDownloadHandler`, `DownloadService`, migration, SQL and storage validation. Strict mode has no TODO cases:

```sh
WZ_DOWNLOAD_CONTRACT_STRICT=1 npm test
```

A pinned **development-only** PGlite dependency runs disposable PostgreSQL in memory. No production DB, socket, HTTP request or artifact transfer is permitted by the harness. The test adapter changes SQL clock expressions to a controlled timestamp, injects tiny metadata/signing fixtures and database faults, and isolates process-local storage circuit state per scenario. It does not implement admission/issuance/redemption behavior or synthesize handler responses.

PGlite serializes transactions, so its two service contexts establish contract behavior rather than native row-lock behavior. The separate `tests/downloads.cjs` gate uses native PostgreSQL and independent pools, including 50 admissions/redemptions and budget/quota contention. CI requires both suites. Attempt limits are relaxed **only in the three dedicated contract concurrency scenarios**; normal contract cases and the native PostgreSQL abuse suite enforce the real limiter.

Quota fixtures seed actual historical SQL rows, excluded only from the adapter's newly-created-request count. Invalid zero-size/null-checksum metadata is rejected by the unmodified migration constraints; those cases also deactivate the file to verify the API denial. No constraint is removed. Multi-field metadata patches are atomic. The admission DTO includes the backend's harmless `can_issue_token` boolean, consistent with its status DTO; no private fields are added. The harness now retains explicit forged CSRF headers instead of overwriting them with valid values.

Public runtime presentation is covered for eligible metadata, an empty provider registry, and disabled files without legacy fallback. Without a migrated schema existing Phase 2 legacy links remain available; direct/disabled mode and DB failure do not downgrade to legacy.

## Coverage

| Group | Assertions |
| --- | --- |
| Contracts | Session/request/status/token/redeem; DTO fields, IDs, server deadlines, private no-store headers, 303 exact-object redirect with no file body; HTML error status; read-only status |
| Timing | 19.999s denial / 20.000s allow; exact request and token expiry; valid token 1ms before expiry; token TTL bounded by request expiry; client time cannot override server |
| Single use | Replay, reuse, rotation, consumed requests, terminal idempotency keys; expired-token recovery; three-generation cap |
| Multiple tabs / identity | Same-file deduplication, different-file conflict, stable user principal across auth sessions; separate clients behind NAT; session/account binding and IDOR |
| Concurrency | 50 admissions and 50 redemptions over two independent worker contexts; one winning admission/disclosure; final network accepted-quota slot contested by two principals |
| Abuse limits | Attempt capacity and refill, failed attempts counted, status buckets independent, accepted rolling quotas, rounded integer Retry-After, same-principal cooldown |
| Eligibility | Inactive/unpublished app/version, absent or mismatched version/file, inactive/quarantined/unverified file, invalid size/checksum, legacy/disabled mode, withdrawal after admission/issuance |
| Fail closed | Shared/deployment kill switches, DB/auth/limiter outage, missing HEAD object, size/version/checksum mismatch, signing/timeout failures; no token consumption before successful grant commit |
| API abuse / leakage | Origin/subdomain/Fetch Metadata/CSRF, forged/missing session, malformed/oversized bodies without Content-Length, unknown fields, UUID/SQL-shaped IDs, duplicate form fields, GET/HEAD/OPTIONS redemption, raw token persistence/logging |

## Test-only adapter integration contract

`runtime-adapter.cjs` must export `async createFixture({clock, origin, data,
relaxAttemptLimits})`. It **invokes Agent G's actual route handlers/services**
with injected dependencies. Do not copy the spec into an independent fake
implementation, return canned HTTP responses, or turn these scenarios into
self-tests of a reference model. Existing TypeScript test loading is available
at `tests/helpers/typescript.cjs` if needed. Map actual service/repository names
against the integrated runtime.

A new fixture owns fresh repository state per test. Fake only external boundaries:
repository/clock/auth/trusted ingress/storage. The actual runtime must read
`clock.nowMs` for security decisions through its injected server-time source.
`clock.set(ms)` and `clock.advance(ms)` replace sleeps. A test repository cannot
prove PostgreSQL row-lock correctness; see the remaining release gates below.

Return these methods:

| Method | Test-only behavior |
| --- | --- |
| `createActor({userId?, network?})` | Seed a valid auth session only when requested; return `{id, cookie?}`. Use distinct client IDs for distinct calls. Network values are trusted ingress fixture metadata, never untrusted request JSON. Download session/cookie/CSRF must come through the actual bootstrap handler. |
| `dispatch(Request, {actor, worker})` | In-process invoke the actual route; return its actual native `Response`. Supply trusted network/auth metadata for the actor. Two worker IDs represent independent service contexts sharing the same repository authority, not two maps. Never follow redirects or make loopback fetches. |
| `patch(target, value)` | Modify only fixture state: `application`, `config`, `version`/`file` by ID, `settings`, `actor` by ID, `principal` by actor, `acceptedQuota` by actor. Principal patch uses millisecond `next_download_at` and null `active_request_id`. Quota patch seeds valid past accepted events to yield `principal10m` or `network10m` counts without 40 preceding HTTP calls. |
| `fault(name, mode)` | Inject failures at dependencies; null clears fault. Names: `database`, `limiter`, `auth` (`unavailable`); `headMissing`, `headSizeMismatch`, `headVersionMismatch`, `headChecksumMismatch`, `signing`, `storageTimeout` (`enabled`). Provider/SQL diagnostics should contain fixture sentinels to exercise safe errors. |
| `barrier(stage, participants)` | PGlite has a no-op barrier: Promise.all starts calls together and SQL transactions serialize. Independent native pools establish contention in the separate PostgreSQL gate. |
| `snapshot()` | Return `{requests, storageCalls, redemptionEvents, acceptedNetwork10m, persisted:{requests}, logs}`. Storage calls use `{operation:'headObject'|'createDeliveryGrant'}`. `persisted` is a faithful normalized view of actual stored data; token hashes normalize to lowercase hex. Include real captured runtime logs. Do not hide/strip raw secrets in the adapter before assertions. |
| `close()` | Release fixture state, barriers and dependency patches; no resources outside the test process. |

`data` is the tiny inert catalog/storage fixture in `fixtures.cjs`. The delivery
hostname uses `.test`; no actual APK or URL is fetched. Preserve exact file/object
relationships. `relaxAttemptLimits:true` applies **only** to the three atomicity
scenarios, raising attempt-bucket capacities so races reach the critical section.
It must not disable accepted rolling quotas, readiness, identity, the local
storage preparation guard or single-use checks. Race losers may return bounded
429/503 denials; at least one must disclose exactly one 303. All other cases use the spec defaults. The error spec leaves some
validation error code spellings unspecified: for 413/415 and duplicate-form
errors the tests require the HTTP status and safe response instead of inventing
a machine code. Withdrawal may be either FILE_UNAVAILABLE or REQUEST_REVOKED.

## Resource isolation

Before importing any runtime adapter the harness removes DB/storage/provider
connection variables and blocks fetch, HTTP(S), TCP, UDP and child-process
launches in this test worker. Requests go directly into handlers; `.test` hosts
are labels only. No live database, local HTTP server, cloud traffic, object
provisioning or large download is involved. Never run the existing Phase 2
`test:integration` runner against production to activate these tests.

## Remaining release gates (not claimed as tested)

- Native PostgreSQL concurrency is tested separately in downloads.cjs and required in CI. Real process termination/recovery and production log pipeline checks remain provider/release gates.
- Real provider GET/Range expiry, private-origin/CDN authorization and ingress IP
  spoofing checks are intentionally outside this no-cloud-traffic suite.
- Browser/mobile download behavior, frontend countdown, production log pipeline,
  cross-process resource guards, network-key rotation and provider byte budgets
  remain separate integration/release checks from spec section 14.
- A 303 proves one link disclosure, not completed file transfer. Never treat test
  counts or application admission counters as proof of cost/egress safety.
