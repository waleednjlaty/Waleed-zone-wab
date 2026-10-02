# Agent R — Admin security QA (#42)

Tests and test infrastructure only. No production DB, migrations, storage traffic, cloud provisioning, APK transfer, runtime fix or PR merge.

## Tested revisions and status

QA branch is based on Phase 4 main `de173adb36f160bf769e41c656ca0e7fe7fbbdf0`. Source dependencies were tested in a separate disposable working directory; no backend/UI implementation is committed to this branch:

- P backend: `82a45223f4481d4d288f2434696b04367a916d52`.
- Q UI: `266bd7558683cc3c939c849382e66f7a6cb8fbbb`.

**Do not release the combined Admin system yet.** The backend security/state suite passes and the UI denies unauthorized identities/locks unavailable writes, but `admin-interoperability.cjs` deliberately fails against the current P/Q combination. It is a real release gate, not a todo or synthetic successful response. On this QA-only branch those dependency tests explicitly skip; that is not integrated-system certification.

## Findings

| Severity / result | Evidence | Required integration change |
| --- | --- | --- |
| Release blocker: CSRF endpoint | Q requests `/api/admin/csrf`; P exposes `/api/admin/session` | Reconcile fixed relative route and decode real token |
| Release blocker: catalog/detail | Q requests `/api/admin/applications?page=…` and `/applications/{id}`; P exposes keyset `/catalog` and separate scoped versions/files/config reads | Reconcile navigation, pagination, record composition and DTOs |
| Release blocker: token format | P issues `expiry.nonce.mac`; Q permits only URL-safe alphanumerics/underscore/hyphen | Accept the session-bound token protocol without weakening P's verification |
| Release blocker: system/budget DTO | Q expects `checked_at`, `enabled`, migration/storage/ingress gates and numeric budget; P returns `shared_enabled`, `activation_allowed:false`, and decimal-string ledger values | Preserve fail-closed unknown gates and BIGINT precision while adapting |
| Release blocker: version payload | Q sends active/published flags and whole metadata body; P accepts a pending create body and explicit revision/action updates | Adapt forms to staged state operations and concurrency revisions |
| Release blocker: config payload | Q sends mode/current version without `expected_revision` | Carry authoritative revision; do not remove backend stale-write protection |
| Release blocker: file payload | Q sends flat metadata without planned UUID; P requires `{id, version_id, metadata}` | Bind exact UUID/hash/key and preserve pending-only creation |
| Informational: streamed denial | Q anonymous/non-owner/expired/forged requests render the explicit not-found UI and no Admin data, but Next's root shell can commit HTTP 200 before nested `requireOwner()` throws | A pre-stream route guard could give a transport 404; no authorization bypass observed |

No confirmed owner bypass, secret/credential/signed URL leakage or unauthorized state mutation was found in the executed backend and HTML/browser checks. Current contract failures keep the frontend unavailable with writes locked; that safety does not make Admin operational.

## Coverage

- `admin-security.cjs`: 51 checks of real auth/session lookup, owner primitives, exact IDs, scoped statistics credential, fail-closed errors, canonical origin and bounded JSON. DB/cookie context is replaced at the boundary only.
- `admin-control.cjs`: 20 checks of the existing emergency download endpoint over real service/HTTP/SQL, including owner-only disable, CSRF/origin/input rejection, no re-enable, outage and zero storage operations.
- `admin-metadata.cjs`: 17 checks of underlying Phase 4 metadata functions and real SQL, immutable metadata, staged states, cross-app selection, rollout blockers and missing tables. This is prerequisite coverage, not an API substitute.
- `admin-api.cjs`: 32 passing checks against all nine actual P route exports, real `authorizeOwnerRequest`/`requireOwner`, real session lookup, real service and PostgreSQL SQL. Covers anonymous/non-owner/expired/stats/forged/duplicate-cookie requests; every supported write's CSRF/origin/oversize/malformed behavior; owner positive controls; app/version/file denial and cross-parent identity collision; state promotions, forged verification, quarantine/retirement, stale writes, direct/re-enable denial, missing tables/column and auth/service DB faults. Denied mutations compare before/after snapshots of metadata/settings/budget/catalog.
- `admin-regression.cjs`: 16 passing HTTP/HTML/client-bundle/SEO checks against Q, including actual owner HTML, non-owner denial, noindex/no-store, sitemap exclusion, no private object references and public routes.
- `admin-security-browser.mjs`: 30 passing flows at 360/768/1440: Homepage, Search, Details, Download, Login, ordinary Account, three denied Admin identities and actual owner Admin at each width. Waits for real visible content (not skeletons), checks overflow, keyboard search dismissal, runtime errors and no external requests. Missing backend leaves submit controls unavailable.
- `admin-interoperability.cjs`: eight failing P/Q acceptance cases plus their failing parent on the tested combination. Missing routes, status decode and real-token acceptance are checked separately. Body-only cases inject the valid real session token at the transport boundary to expose schema/revision failures instead of masking them behind the already established token-format failure. No handler security decisions are mocked.

The 136 passing new security/HTML checks (51 + 20 + 17 + 32 + 16) and 30 browser flows are separate from the failing interoperability gate. PGlite serializes transactions: no native multi-pool/concurrency claim is made. Existing CI's disposable native PostgreSQL checks remain in place.

## Reproduce

Use Node 20.19.5. `npm test` discovers all `.cjs` suites. `scripts/test-integration.mjs` includes the new HTTP/browser suites and still requires its guarded empty literal-loopback `wz_phase2_test` target. The independent API suite uses PGlite and no HTTP/DB socket.

```sh
npm run typecheck
npm run lint
npm test
npm run build
WZ_ADMIN_CONTRACT_STRICT=1 node --test tests/admin-api.cjs
node --test tests/admin-interoperability.cjs
```

The last two commands require P/Q sources in the integration working tree. Strict mode fails rather than skips a missing backend; the interoperability suite fails on a present incompatible combination. Never remove these failures to obtain a green release without reconciling the contracts.

For local HTTP/browser checks where native PostgreSQL cannot run, optional tooling remains outside the application dependency tree:

```sh
npm install --prefix /tmp/wz-qa-tools --no-audit --no-fund @electric-sql/pglite-socket@0.2.11 playwright@1.51.1
node /tmp/wz-qa-tools/node_modules/playwright/cli.js install chromium
WZ_PGLITE_SOCKET_MODULE=/tmp/wz-qa-tools/node_modules/@electric-sql/pglite-socket/dist/index.js WZ_BROWSER_MODULE=/tmp/wz-qa-tools/node_modules/playwright/index.mjs node tests/admin/local-fixture.mjs tests/admin-regression.cjs tests/admin-security-browser.mjs
```

The local runner creates/disposes a fresh in-memory DB, binds literal loopback, seeds inert metadata, strips inherited provider/DB config, forces deployment/provider/ingress off, and loads a test-only non-loopback TCP/UDP guard. Browser interception blocks every external request and fails on attempted traffic. Session config is temporary/mode 0600. No APK bytes/provider requests occur. Native production-mode Admin APIs require HTTPS; their exact canonical-origin behavior is exercised in the independent handler suite rather than weakening that guard for the HTTP browser fixture.

`WZ_ADMIN_SCREENSHOT_DIR` optionally writes local diagnostic screenshots. `agent-browser`'s daemon cannot start in this container; actual Chromium Playwright is the documented fallback. Tests use a unique browser filename to avoid colliding with Q's standalone UI test runner.

Contract sources: issue #42, `docs/OWNER_ADMIN_API.md` (P), `docs/ADMIN_UI_HANDOFF.md` (Q), `src/lib/auth.ts`, `src/lib/authorization.ts`, `migrations/001_downloads.sql`, and Phase 4 integration review. No production readiness or native-lock certification is inferred from skipped cases.
