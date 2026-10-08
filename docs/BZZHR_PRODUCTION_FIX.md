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
