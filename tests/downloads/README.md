# Agent J — Phase 3 download contract tests

Issue: [#21](https://github.com/waleednjlaty/Waleed-zone-wab/issues/21).
Only tests, assertions, fixtures and this handoff are added. No runtime API, schema,
UI, dependency, cloud setting or production database is changed.

## Sources and expected failures

Assertions derive from [DOWNLOAD_SYSTEM_SPEC.md](../../docs/DOWNLOAD_SYSTEM_SPEC.md),
sections 3–6, 8 and 14, and the fail-closed / zero-cost safeguards in
[CLOUD_FREE_TIER_PLAN.md](../../docs/CLOUD_FREE_TIER_PLAN.md), sections 9–10 and the
integration reconciliation. Baseline is `7264a93`; Agent G's remote branch also
had no download runtime when inspected.

There are **97 expected runtime contract failures**, plus **13 passing assertion/
fixture checks**. The runtime failures are explicitly marked `TODO` only when
`tests/downloads/runtime-adapter.cjs` is absent. Each fails at the missing-adapter
assertion before its scenario executes. These are executable scenario bodies,
not successful backend verification. An existing but broken adapter is never
masked as TODO. Integrating Agent G alone does not activate these tests: the
small test-only runtime adapter described below must also be supplied.

```sh
# No services, credentials or network are required.
node --test --test-reporter=tap tests/download-harness.cjs tests/download-contract.cjs

# Release gate: missing runtime/adapter is a real failure (exit status 1).
WZ_DOWNLOAD_CONTRACT_STRICT=1 node --test --test-reporter=tap tests/download-contract.cjs

# Included automatically in the existing tests/*.cjs npm test glob.
npm test
```

On this branch the first command reports 110 tests: 13 pass, 97 TODO, 0 ordinary
failures. Strict mode reports 97 failures, 0 pass, 0 TODO. **The default exit code
must not be interpreted as permission to release downloads.** Run strict mode
after integration; require zero TODO/skipped cases for these 97 scenarios.

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
after inspecting G's implementation; no runtime names are assumed here.

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
| `barrier(stage, participants)` | Configure an asynchronous rendezvous at admission entry before acquiring authority locks, or at redemption entry before its storage preparation guard. Release automatically when all participants arrive. `admission` and `redemption` must exercise independent worker contexts. Never hold an authority lock at this barrier; otherwise the barrier would itself deadlock. |
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

- Actual PostgreSQL concurrent admission/consumption/rolling quota locks across
  independent connections, fresh clock after lock acquisition, deadlocks and
  process failure after commit: require a separate disposable local database.
  No production DB may be used. An in-memory repository is insufficient evidence.
- Real provider GET/Range expiry, private-origin/CDN authorization and ingress IP
  spoofing checks are intentionally outside this no-cloud-traffic suite.
- Browser/mobile download behavior, frontend countdown, production log pipeline,
  cross-process resource guards, network-key rotation and provider byte budgets
  remain separate integration/release checks from spec section 14.
- A 303 proves one link disclosure, not completed file transfer. Never treat test
  counts or application admission counters as proof of cost/egress safety.
