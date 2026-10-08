# BZZHR production download repair (2026-10-08)

Baseline: Website `5740503c21051cb959c95eb210e3ef8efd694816` (includes #55–#58); Bot `31f146c` (#7). No schema or production catalog migration is added.

## Confirmed diagnosis

An authorized, anonymous, public-domain text file was uploaded through the provider's documented PUT API. Its public page is `https://buzzheavier.com/724hyjkckpyu` (provider expiry: 2026-10-12). GET page → actual hx-get → HTMX GET returned HTTP 204 with HX-Redirect to **ts.buzzheavier.com**. Download returned HTTP 200, attachment disposition and 89 bytes. SHA-256: `9ed9a2a5581029dd242caf417d58af6c4e1abff4795a55708bb63b9dc5a422c2`.

Both prior resolvers allowed only the main provider hosts and fafda.to. They therefore reject this current, observed CDN with INVALID_SOURCE. This is an independently reproduced integration defect; it is not the cause of an earlier SteamRIP challenge. No signatures, cookies or temporary destination URLs are recorded here.

The same QA ID had a public page on bzzhr.co, returning HTMX 204 as well; bzzhr.to returned 404. Do not assume that rewriting hostnames proves identical files. The old signed URL still answered 200 after ten minutes: actual expiry was NOT demonstrated. Deleted/expired behavior is covered by regression fixtures, not asserted as a live success.

A live SteamRIP homepage GET returned 403 with “Sorry, you have been blocked”. This is a Cloudflare access block, not evidence that BZZHR itself is challenged. The hardened direct Node transport in this restricted work environment fails DNS (PROVIDER_DNS_FAILED). Ordinary permitted HTTP tooling can reach BuzzHeavier; it is not substituted for production's DNS-pinned TLS transport. Railway runtime evidence must determine whether the deployment IP can use the same legitimate flow.

## Changes

- Add only the observed exact ts.buzzheavier.com host to Website/Bot file policies and download CSP. No wildcard, proxy or challenge solver.
- Read provider-declared hx-get paths and query parameters, bounded to the same origin/file ID; skip preview/account/destructive endpoints. Try at most three declared alternatives. Never manufacture `/download` or cache a completed signed URL.
- Preserve bounded, host/path-scoped Website cookies across page redirects and the HTMX request. Drop sensitive request headers on cross-host redirects.
- Verify final HTTP status/content type with HEAD through the same DNS-pinned HTTPS transport, checking each redirect. File bytes are not relayed through Railway. Prefer a vetted IPv4 address when both families exist (Railway IPv6 egress is disabled).
- Distinguish SteamRIP, BZZHR page, HTMX, and final-file errors. Safe logs contain only stage, exact host, status, and category. DNS, 401/403/429/5xx, missing HX-Redirect and redirect loops have separate codes.
- Negotiate JSON on the existing POST legacy/redeem route only after countdown, source-revision recheck and atomic consumption. Native form callers retain POST/303. The UI prepares/resolves/retries inline, then performs same-tab native navigation. Attachment responses keep the site visible; upstream HTML may navigate the tab. The UI never claims file completion.
- Recognize direct public BZZHR page sources in the existing catalog selector. Telegram priority, approved manual links, authentication, shared DB, locale and direct-storage gate remain intact.
- Remove new-tab targets from download controls. Human/auth/access blocks may offer an explicit stable source link after eligibility. Browser verification cannot unlock Railway's server session; a different lawful source or operator intervention is required.

## Operator live canary

Run `node scripts/test-provider-live.cjs https://buzzheavier.com/724hyjkckpyu` from the release image while the QA file exists. This uses the real resolver/transport, requires our exact 89-byte content and hash, and reports only sanitized status/host/hash metadata. It has no DB writes, fixtures or network bypass and refuses large/unrecognized payloads. It is never run during ordinary user requests. The QA file expiry above means this command must not become a permanent release gate.

## Validation limits

Local native PostgreSQL cannot start under the sandbox's UID/group restrictions. Existing CI's disposable PostgreSQL remains authoritative for locking/concurrency and strict contracts. PGlite HTTP/browser checks supplement, rather than replace, that gate. Browser testing uses Chromium with Android emulation and desktop viewports, not a physical Android Chrome device.

Fixtures, HEAD responses, redemption and 303 alone do not prove a production browser downloaded a complete file. Record Railway canary and rollout evidence in the PR before declaring this incident resolved. No CAPTCHA bypass, TLS/CSP/rate-limit disabling, destructive data changes, paid storage or DIRECT_DOWNLOADS_ENABLED activation is permitted.

## Additional independent production diagnosis (2026-10-08)

This follow-up starts at website main `5d71307f86c5281772cba4c108d66200ddd31ce2` (#60), bot main `139a7ddbbb0732aea51f99566e3fb5ef0038e415` (#8). It preserves the existing countdown, redemption, resolver, catalog and delivery architecture.

A second authorized original text canary was uploaded through the provider's documented anonymous PUT API to `w.bzzhr.co`: public page `https://bzzhr.co/8hcdyeypd460`, also served by `https://buzzheavier.com/8hcdyeypd460`, expires 2026-10-12. GET file downloads returned exactly 67 bytes, SHA256 `6c2b4eccbe5ad9d248f33983d466fefd5e619046320f429f78dd486c578496bc`, from **both** `ts.bzzhr.co` and `ts.buzzheavier.com`. The same file ID returned 404 on bzzhr.to: file namespaces must not be synthesized across domains. Live HTML advertised fresh signed hx-get download and alternative actions, with HX-Redirect 204 responses. No games were downloaded; only our original text bytes. This successful public-network experiment is NOT proof of Railway egress success or production browser download.

Railway deployment `196f9265-7440-4e68-929b-834a57a52e78` built and migrated successfully, including analytics read verification, but its operator live canary failed **403 / PROVIDER_CHALLENGE at bzzhr_page / buzzheavier.com** during PRE_DEPLOY_COMMAND. The existing production website therefore still served old SHA 5740503 at the time of diagnosis. Bot #8 deployed successfully. Logs inspected without exposing environment values, signed queries, cookies or tokens. Later service configuration contained only the normal `npm run migrate:release` pre-deploy command; this follow-up does not change Railway configuration.

Additional fixes:
- Allow only the independently observed exact `ts.bzzhr.co` CDN in both resolver and form CSP; no wildcard or invented ts.bzzhr.to.
- Retain arbitrary provider-advertised endpoint paths/query names and add genuine data-hx-get support. A shared Turnstile script alone is not evidence of an interstitial challenge; actual challenge markers and cf-mitigated fail closed.
- Try up to three actual SteamRIP source links, never fabricated cross-domain file IDs. A challenge/auth/rate-limit response stops retries across mirrors.
- HEAD validation now returns the validated final redirect URL. On 405/501 only, a Range GET closes at headers without relaying file bodies. Reject deleted, forbidden, expired and HTML/JSON destinations.
- Reject signed BZZHR URLs as persistent catalog sources; recheck revision/publication after failed external resolution before exposing the stable manual fallback.
- Keep inline same-tab preparation/resolution, respect Retry-After, discard expired/replayed/stale grants and abort pending requests when the UI unmounts. Native 303 remains available for existing callers. Telegram and manual sources continue through the same existing route.
- Bot receives exact-host scoped cookies, safe finite stage diagnostics and bounded per-source backoff; two active tasks and 25-second budget remain.

Verification after reconciliation: targeted website provider/API/localization tests **100 passed**; bot **202 passed**. Website lint/typecheck/build passed. A one-time PR-only CI job invokes the existing operator script with the real pinned DNS/TLS transport on both canary pages and hashes file bytes; fixtures are explicitly refused. Its result must be checked separately from green fixture tests. Full CI, Railway rollout and production byte transfer are pending when this change is submitted. Desktop Chromium and Android emulation are available; physical Android hardware is not available in this environment. Real SteamRIP pages may independently return Cloudflare 403 and some advertised BZZHR pages redirect back to SteamRIP rather than a file. No challenge bypass is implemented.

No database schema/data recreation, auth/CSP/rate-limit relaxation, TLS disablement, file proxy, completed signed-URL cache, new download architecture or DIRECT_DOWNLOADS_ENABLED change.
