# Final download processing integration review

Baseline: website main `df66eae708c2e391a964d6f64a157d45fce6b9ce`; bot main `11c10b1359df6c5699c91b34b92e043a5a167369`.
Branch in both repositories: `agent/final-download-processing-integration`.

## Behavior and compatibility

The existing `/download/{integer application_id}` route, native POST redemption, server-authoritative 20 seconds and empty HTTP 303 response remain the delivery contract. Telegram sources still redirect to the exact public Files Channel message. The website does not possess a BOT_TOKEN, fetch Telegram files, proxy APKs or enable direct storage downloads.

`legacyDelivery` is the common source selector for presentation/preparation/redemption: valid Telegram source, explicit approved `shrankme_url`, SteamRIP `devupload_url`, approved legacy `devupload_url`, otherwise unavailable. Invalid explicit sources fail closed. Successful resolution never edits a catalog row. The shared PostgreSQL catalog and bot revision fields are preserved.

For SteamRIP, preparation returns only a client-bound countdown grant. After successful eligibility verification, the server discovers the BZZHR source, extracts its current signed HTMX endpoint and obtains a fresh validated destination. This destination appears only in the successful 303 Location header. It is absent from pre-redemption HTML/JSON and is never persisted or logged.

## Verified issues addressed

- Legacy grants now have durable hashed redemption state, including concurrent-use exclusion. Failed provider resolutions do not consume the grant. Each grant has at most three attempts and retains its original expiry. New preparation retains rate limits and starts another full countdown.
- No transaction, row lock or advisory lock spans provider HTTP. The final short transaction rechecks active/published status, delivery mode, revision and exact selected-source hash, then atomically consumes the grant. Changed/disabled/unpublished sources cannot use stale results.
- HTTP-only resolution has a two-operation instance cap, in-flight deduplication bound to application/revision/source, bounded deadlines and a short failure backoff. Completed signed links are not cached.
- UI guards duplicate submissions, keeps skeletons confined to actual initial loading, and explains countdown, server preparation, redirection and retriable provider failures in Arabic. Retry uses a same-origin POST and the existing private grant; no provider token is exposed as a destination.
- Metrics preserve existing names and add `external_download_redirect`; BZZHR redirects are not labeled Telegram redirects. Owner analytics include the additive event.
- Browser QA exposed illegal `notFound()` usage in the root layout. Missing-detail checks now run in the appropriate nested layouts, with the root warming the request cache and retaining canonical checks. The global loading boundary was removed to prevent early 200 streaming; catalog loading skeletons are scoped to actual catalog data fetching instead. Browser nonce masking on JSON-LD is handled narrowly on that script without removing its real nonce or weakening CSP.
- Dependency audit found GHSA-68fv-2mgg-jv7q in transitive `source-map-js` 1.2.1. Only that lockfile entry was updated to the patched 1.2.2; `npm audit --omit=dev --audit-level=low` now reports zero vulnerabilities. Advisory: https://github.com/advisories/GHSA-68fv-2mgg-jv7q.
- An existing S3 fixture deadline of 100ms flaked on cold SDK initialization under the complete suite. Its success-path fixture budget is now 1000ms; production budgets and dedicated timeout assertions are unchanged.

## Provider security policy

Only HTTPS with no credentials, fragments, control characters, whitespace/backslashes or explicit ports is accepted. Fetch hosts are exact SteamRIP/BZZHR hosts: `steamrip.com`, `www.steamrip.com`, `bzzhr.to`, `bzzhr.co`, `buzzheavier.com` and their explicit `www` forms. Every DNS answer must be globally routable; one vetted address is pinned into a fresh TLS-verified socket. Redirects are manual and every destination is validated before contact. No environment proxy, pooled socket reuse or second DNS lookup is used.

DNS 3s, connect 4s, headers 6s, body inactivity 4s, individual HTTP total 10s and complete resolution 25s are bounded. HTML is capped at 1 MiB. Redirects stop after four requests. Provider cookies are bounded and passed only to the same-host signed endpoint. Challenges fail closed; no CAPTCHA solver, browser farm, proxy bypass or disabled TLS is added.

Final file hosts are the same finite BZZHR hosts plus **exactly `fafda.to`**. This additional hostname and `/d/...?...v=...` shape are justified by the existing bot fixture `test_hx_redirect_direct_download_is_accepted` in `tests/test_steamrip_extractor.py`, not an internet wildcard. The final signed `v` value must be nonempty and unique; malformed paths/headers/queries and private DNS are rejected. This policy is fixture-backed; current live provider/CDN behavior still requires independent verification (see limitations).

Manual links use the same default finite host policy on both sides: `devuploads.com,shrinkme.io,shrinkme.site`. Operators must keep customized `LEGACY_DOWNLOAD_ALLOWED_HOSTS` identical. SteamRIP detection is exact-host based. Legacy fields are not removed.

## Database and release procedure

`006_download_processing.sql` is additive/idempotent: one grant table with expiry index and an extended analytics CHECK constraint. It does not rewrite applications or temporary URLs. The dedicated operator command `npm run migrate:download-processing` has SHA-256 ledger tracking and checksum mismatch refusal, a transaction-scoped migration lock, 2s lock timeout and 30s statement timeout. `migrate:release` includes it. No startup, build or HTTP route runs migrations.

Before any separately authorized deployment, apply the reviewed release migrations using the existing operator/pre-deploy process. Leave `DIRECT_DOWNLOADS_ENABLED=false` and all four AdSense activation/review/privacy gates false. Existing publisher configuration is preserved. Download pages and retries remain ad-free. No production database or deployment was modified in this task.

## QA evidence

- Production build/type/lint: passed locally.
- Provider, redemption and migration focused tests: passed, including 19.999s denial / 20.000s eligibility, no pre-redemption destination, failure/retry/expiry, single concurrent winner and source/publication races.
- Production Next HTTP/API integration on disposable loopback PostgreSQL-compatible PGlite: **101 passed** (auth, owner/non-owner, admin, limits, private data, SEO, ads, downloads, search). Real PostgreSQL locking remains a separate CI gate.
- Browser QA: **204 checks/flows passed** across 360/768/1440: monetization/legal/admin 63, public/search 24, SEO 21, native Telegram/catalog 42, adversarial Phase 8 39, native SteamRIP 15. Telegram and SteamRIP final hops were intercepted only after the real POST/303 was observed; no real external file was requested. Screenshots were visually reviewed at mobile and desktop sizes.
- The full unit suite is being revalidated after the cold-SDK fixture repair; final totals will be appended before handoff.
- Bot: complete pytest suite passed, including shared resolver, once-only footer, Telegram copied-file captions, promo caption/message bounds, HTML escaping, duplicate callbacks, transaction release and stale publication compensation.
- CI now enables the finite mocked-provider native POST/303 browser test on disposable PostgreSQL. Test fixtures block all non-loopback real network access; optional metrics outage simulation is only enabled for the local PGlite socket runner, not native PostgreSQL CI.

## Limitations / required review

Live SteamRIP provider verification was attempted with the same hardened public HTTP implementation and failed DNS (`EAI_AGAIN`). No workaround or bypass was attempted. A live SteamRIP/BZZHR redirect and current CDN hostname are **not verified** by this environment. Public production journeys, real Telegram channel delivery, owner production session and Railway metrics were not exercised against production.

PGlite validates SQL/state contracts but cannot prove independent native PostgreSQL row-lock races. The repository's strict disposable PostgreSQL CI is the required follow-up gate. Local browser fixtures simulate a metrics-pool outage to avoid PGlite's single-backend wire multiplexing limitation; analytics success is tested separately against SQL.

Bot callback/promo deduplication is bounded per process; crash-safe exactly-once Telegram delivery across multiple bot instances would require an outbox/idempotent delivery protocol and is not claimed. Telegram can fail after counters commit. No global redesign, catalog synchronization job, second database, ad activation, merge or production deployment is included.
