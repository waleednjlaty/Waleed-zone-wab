# Owner Admin UI integration

The dashboard uses the actual owner API in [OWNER_ADMIN_API.md](OWNER_ADMIN_API.md). Source work #44/#45/#46 is integrated on `agent/admin-integration`; the backend security contract remains authoritative.

- `/api/admin/session` supplies the dotted session-bound CSRF token. Tokens remain in component memory and are never persisted in browser storage.
- `/api/admin/catalog` uses `limit`/`after` keyset pagination; no fabricated total is shown. Catalog mode is unknown until download configuration is read. The API has no approved image URL field, so the UI shows its standard icon placeholder.
- Application detail is composed from catalog, configuration, all version pages and each version's file pages. Every scope is validated. Bounded pagination fails closed on duplicate/partial/inconsistent responses. Metadata storage keys, SHA and provider versions are excluded from the presentation model.
- Creation makes pending versions/files only. Draft renames and explicit `activate`/`publish`/`withdraw` actions carry the latest opaque revision. Previously published versions retain immutable label history after withdrawal. File activation/deactivation is staged and revision checked; the dashboard cannot mark a file verified.
- File input requires its explicit publisher manifest UUID and nested metadata. An optional UUID generator helps prepare a new manifest; the object key must exactly match `artifacts/<file-id>/<sha256>.apk`. Railway uses `railway-s3` and a null object version. There is no upload or storage call.
- Configuration writes carry `expected_revision`; legacy/disabled clear the selected version. Direct remains blocked. A 409 shows a conflict and refetches authoritative state without retrying a write.
- Kill control disables only, requires explicit confirmation, and succeeds in the UI only after an authoritative reread.
- Budget byte counters remain decimal strings and use BigInt arithmetic. The byte display is exact; only the bounded progress percentage becomes a number. This is a configured reservation ledger, not live provider billing.
- Successful status reads prove schema availability in that environment. They do not attest production migration, storage, ingress or a real canary. Those gates remain blocked, and no Direct Ready state is invented.

`requireOwner()` guards the Admin layout; each API guards independently. A root pre-stream notFound guard was evaluated but produced empty error-shell HTML in this Next architecture, so it was not retained. Each API independently authorizes ownership and enforces origin/CSRF/payload/state protections. Unauthorized HTML must render explicit not-found, private/no-store and noindex, without Admin data. Root streaming can produce HTTP 200 for that denied UI; transport status alone is not authorization evidence.

Validation: `tests/admin-interoperability.cjs` executes the real client against real handler exports and PostgreSQL SQL without token/body substitution. `tests/admin-api.cjs` runs strict API security checks. `scripts/test-admin-ui.mjs` covers presentation, errors, confirmation, keyboard and WCAG at 360/768/1440. `scripts/test-admin-integration.mjs` uses a disposable native PostgreSQL database, a production Next build and HTTPS on literal loopback for actual form acceptance; it blocks external network access. Native concurrency lives in `tests/admin-owner-concurrency.cjs`. Existing public API/SEO/download/browser suites remain required.

CI runs these release gates on the integration branch before a final PR. No production migration, provider activation, APK upload, billing or direct enablement is performed.
