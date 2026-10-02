# Phase 3 integration — Agent K

Integrates #25 backend, #24 UI, #23 QA, then #26 SEO. PR #4 is excluded.

## Result and safety

Direct downloads stay disabled (`DIRECT_DOWNLOADS_ENABLED=false`) and the frozen production storage registry remains empty. No storage, CDN, billing, trial, migration or deployment resource is provisioned. Next.js never sends APK bytes. No production migration is automatically run.

UI uses the real session/request/status/token/redeem endpoints. Public file metadata now comes from the actual DownloadService eligibility rules, not the previous empty JSON seam. Only public selection UUIDs/version/size/type are serialized; object keys, backend, network/client/user IDs, hashes and grants stay private. Direct/disabled applications cannot silently downgrade to a legacy link. Unmigrated catalogs retain Phase 2 legacy behavior. Database failure denies direct presentation. Unavailable pages contain no redeem form, and token/CSRF form fields exist only in READY; expiry removes them. Native POST remains the redemption mechanism.

The sole merge conflict was `.github/workflows/integration.yml`: retain full unit/SEO/UI coverage, add strict contracts and native PostgreSQL download tests, and run both browser suites. Service security and rate-limiting behavior from #25 are preserved. Admission/status DTO's public can_issue_token field is explicitly accepted by the integrated tests. The QA harness now preserves forged CSRF headers. Fixture quota rows, atomic metadata patches and circuit isolation are corrected without weakening production controls.

## Validation

Node 20.19.5, isolated native PostgreSQL 18.4 locally; CI uses PostgreSQL 16.

- npm ci, typecheck, lint, production build: pass.
- Full strict npm test with disposable native download DB: 216 pass, zero failures/TODO. The 41 production-server integration cases are skipped only because that invocation does not provide WZ_TEST_CONFIG; all run in the dedicated integration command. Four subsequently added production download checks also run in that command.
- Download contracts: original 97 plus 3 runtime public-metadata/provider-gate regressions, all executable and passing; no contract skips/TODO. PGlite is a pinned development-only dependency for in-process PostgreSQL fixtures. Controlled test SQL/JS time checks exact boundaries; production clocks are unchanged.
- Native SQL suite: independent connection pools, real 20s wait, 50 admissions, 50 redemptions, quota/budget races, failure/withdrawal/replay/binding. The malformed unauthenticated/forged forwarding 401-versus-429 regression passes.
- Production integration: 45 pass, zero failures/skips. Includes unavailable direct page, 405 handling, fail-closed unverified ingress, private response headers and sitemap exclusion.
- Production browser: 24 flows plus 21 SEO checks at 360/768/1440; home/search/app/game/download/privacy/login/account, keyboard/reduced motion, no overflow or console/runtime errors.
- Isolated frontend browser: 18 scenarios for countdown/READY/native POST/429/expiry/reload/deduplication/CSRF refresh; no countdown skeleton. API replies are fixtures in this layer; real runtime and PostgreSQL behavior are verified separately. Screenshot review covers 360/768/1440, countdown, ready, rate limit and expiry.
- Optional agent-browser CLI daemon cannot start in this container. Installed Playwright Chromium completes the browser gates; this is tooling fallback, not a skipped browser gate.

CI on the final integration PR is the final merge gate. Do not infer provider readiness from fixture 303s or SUCCESS; they prove link disclosure rather than completed transfer.

## Migration and environment for later activation

`migrations/001_downloads.sql` is additive and tested only in disposable databases. It preserves legacy applications/bot/auth tables and defaults settings off, existing applications to legacy. Rollback should disable deployment/shared settings and retain schema/history; do not drop live grant/quota records. Use the explicit checksum-ledger migration runner only under a separately authorized production migration, with a backup and migration role. Nothing runs at install/build/request time.

Existing `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `OWNER_USER_ID` remain relevant. Phase 3 variables are documented in `.env.example`: `DIRECT_DOWNLOADS_ENABLED`, `DOWNLOAD_ALLOWED_DELIVERY_HOSTS`, `DOWNLOAD_INGRESS_VERIFIED`, `DOWNLOAD_TRUSTED_IP_HEADER`, `DOWNLOAD_IP_HASH_KEY`, optional `DOWNLOAD_IP_HASH_PREVIOUS_KEY` and `DOWNLOAD_IP_HASH_OVERLAP_UNTIL`. Do not set ingress verified before testing actual header replacement on every hostname. No new production value is set by this integration.

Before real delivery: review/implement an immutable-object provider adapter, operator migration, authentic verified file/version/config metadata, owner-confirmed budget/account hard limits, verified ingress, provider/private-origin/Range/expiry tests, and real mobile native 303 behavior. Existing CSP `form-action 'self'` is intentionally retained; approved external redirect compatibility is a storage-stage release gate and may require a narrow reviewed host policy. No broad CSP relaxation occurs here. Google recrawl/Search Console sitemap submission remains an indexing follow-up; rankings are not guaranteed.

The integrated foundation is ready for a separately scoped storage integration. Real-download rollout remains blocked and fail-closed until the above gates pass. Agent K stops after the final PR merge; no storage/admin/ads work starts.
