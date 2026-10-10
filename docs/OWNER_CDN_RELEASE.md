# Owner CDN acceptance release

This release incorporates the opt-in engine from PR 64 and the independent
cookie-jar/HTMX fixes from PR 61. It does not certify live BZZHR extraction.
Keep `BACKGROUND_BROWSER_ENABLED=false` until the real provider and resource
gates pass. Railway's previous isolated browser attempt received a real 403.

## Owner flow

Set `OWNER_CDN_TEST_ENABLED=true` only on the existing website service.
The flag defaults to off. No database, provider credential, extra service,
Chromium image, paid plan or scheduled refresh is required for this mode.

1. Sign in with the configured owner account on the normal HTTPS website.
2. Open `/admin/download-test?application_id=54` or choose another published,
   active SteamRIP/BZZHR-backed item. Telegram items retain their normal delivery.
3. Load its current source. Paste its matching stable BZZHR file page and the
   signed URL copied manually using the provider's Copy download link action.
4. Confirm the file belongs to this item/version. By default, a header-only
   verified HTTPS destination is required. The optional explicit owner exception
   allows testing on a HEAD access barrier and displays `owner_unverified`.
5. Save, open the normal `/download/ID`, prepare, wait 20 seconds and redeem.
   The existing durable one-use grant transaction returns the CDN destination.
   The browser requests the file directly from CDN, in the same tab where the
   upstream attachment response permits it. Completion cannot be claimed by UI.

The exception is never enabled for an ordinary visitor, another owner session,
statistics tokens, Telegram delivery or an unsupported source. It never turns
a provider challenge into automated extraction success. Both verified and
unverified owner-imported links remain owner-session-only in this release.

## Security and cache

- Cache key binds application ID, exact source revision, source URL and owner
  session scope. Only URLs are shared by the autonomous browser job; no user
  cookies enter its fresh isolated context. Concurrent same-source grants use
  one job; unrelated jobs get bounded busy/backoff behavior.
- Both caches are bounded process memory, at most 100 entries and 600 seconds.
  Restart evicts links; no signed URL is written to PostgreSQL or a disk store.
  Revalidation never renews TTL. Refresh is on demand, never a timer or cron.
- Verified links are HEAD-checked on each redemption. An explicit unverified
  owner link is checked again, retaining its exception only on an access/DNS/
  timeout/unsupported-HEAD barrier. Known removal/expiry, HTML, 429, foreign
  hosts or a changed file ID reject and evict the link. An opaque signature's
  upstream expiry cannot be inferred if CDN refuses HEAD: the owner UI says so.
- Exact HTTPS allowlist, declared file ID, no foreign ports/credentials/hash or
  extra query parameters for owner input; `ts.bzzhr.to` is included explicitly.
- Owner API uses existing live session authorization, canonical origin,
  session-bound CSRF, bounded JSON body and durable rate limiting (10 writes
  per minute). Status/import responses contain only safe test metadata.
- Eligibility and source revision are read again after network work under the
  existing short database transaction. Cache TTL/revocation is checked before
  atomically consuming the grant. Expired/replayed/cross-client grants fail.
- Only HEAD is used for server-side file verification. No game file GET,
  proxy, streaming or file storage is introduced. Analytics and logs never
  receive pasted or resolved signed URLs.

## Evidence and operational limits

Local Node 20 typecheck/lint/build and focused security contracts are run before
release. GitHub integration runs native PostgreSQL and actual pinned Chromium,
the prior admin/download/bilingual/Telegram gates and the new independent
Android-sized owner CDN acceptance gate in Arabic and English.

`tests/owner-cdn-browser.mjs` uses real Next HTTPS handlers and durable grants.
Only its finite CDN transport is a tiny authorized attachment fixture. It
verifies actual browser bytes, current-tab delivery, countdown denial, replay,
session isolation, and separate verified/HEAD-blocked states. These fixture
results must not be described as a successful live BZZHR file download.

Existing production migrations remain idempotent; PR 64 adds only the stable
provider-page discovery table. No signed URL column is introduced. Preserve
the previous successful deployment and main commit for rollback. This release
does not switch production to `Dockerfile.browser`, launch Chromium, enable
direct object storage, modify monetization gates, or change the Telegram bot.
