# Background SteamRIP/BZZHR browser engine — release blocked

Baseline: website main `0bfa6faab2e6ad5974f54ee5e6b867edeaf6f30b` (merged #63). Bot main `9e22eeb368dee3f5cd9ccaadd8a9f6b2b7bc39c2` (#12). Reviewed website #61: still open with failed real-provider access. No cherry-pick of that unverified release. Work branch: `feat/background-provider-browser-20261009`.

## Implementation

After the existing 20-second HMAC/client-bound countdown and durable attempt reservation, an opt-in `BACKGROUND_BROWSER_ENABLED=true` path invokes one isolated child process through private IPC. Chromium really navigates, runs the source JavaScript, clicks the declared BuzzHeavier anchor and download element, and observes native HX-Redirect/Location responses. A browser-native fetch is used only for a declared hx-get/data-hx-get element that did not initiate a request and has no installed HTMX. This is not the old HTTP resolver disguised as a browser.

A valid final URL is verified using a DNS-pinned HEAD request. Redirected final paths are revalidated. Game-file GETs are aborted inside the worker. The existing short final database transaction rechecks publication/source revision, request expiry, and one-use consumption before returning a destination. The client navigates the same tab; no claim of completed download is made.

Telegram/manual delivery and DIRECT_DOWNLOADS_ENABLED=false retain existing behavior. #63's explicit manual challenge fallback remains. Background automation is OFF unless explicitly configured. No bot changes.

## Popup and network policy

Chromium resolves finite exact hosts to vetted public numeric addresses for each job; all other DNS names fail closed. Chromium CDP Fetch validates every native request and HTTP redirect hop before network I/O. Browser auto-attach pauses and closes new popup tabs before their first request; a legitimate target=_blank anchor is clicked and its declared provider is followed in the original worker page. At most two popup targets are tolerated per job; further targets abort work. Dedicated/shared/service workers are paused and closed, iframe documents and WebSockets are blocked. Only a source declared within the saved SteamRIP page’s Download Links section or a matching discovery cache can become the provider. Heading/document order and article boundaries exclude navigation, sidebars, footer links and subsequent unrelated sections. Advertisements are not clicked. Provider navigation must match a declared file identifier, including normal provider alias redirects. HX-Redirect/Location can yield a file only from the actually clicked declared endpoint (or a validated same-origin endpoint redirect chain); unsolicited provider document headers and known-CDN requests cannot replace the destination. Static file links are captured only when they exactly match the clicked declared href. Scoped provider cookies stay inside the context; cross-origin Cookie/Authorization/Referer forwarding is restricted. Service workers and WebSockets are blocked. No public debugging port, proxy, imported user cookies, solver or CAPTCHA interaction. Parent runtime logs record each browser stage start/completion and the failing stage/code with elapsed time; they contain no URLs, cookies, grants or environment values.

An ordinary passive Cloudflare script does not count as a challenge. Actual interstitial/Turnstile markup or a challenge response does. A 403/429 or actual challenge stops extraction and mirror fan-out, then opens a 60-second backoff. Removed/5xx declared mirrors may fall back to another declared mirror, at most three.

## Cache and progress

Migration 007 adds one discovery row per application to existing PostgreSQL. It stores the original source, exact source revision, at most three stable query-free provider pages, and a six-hour expiry. It cannot accept CDN/signed destinations. The final transaction writes discovery only after the source recheck; obsolete revisions cannot be read as current. No completed signed-URL cache. Single-replica in-flight deduplication combines requests for the same app/revision/source.

The same-origin POST status endpoint checks the client-bound HMAC, countdown, live durable grant, current publication/revision, and rate limits on every poll. Responses contain one finite state only. The UI polls every two seconds while redemption runs, presents real stages in Arabic/English, and stops polling on completion/unmount. It exposes no cookies or signed URLs through progress responses.

## Resource limits and Railway observations

One browser job, one fresh context, no queue, at most three pages, 100 requests, 8-second launch/navigation, 6-second interaction, 40-second worker deadline / 45-second parent deadline. A grant nearing expiry shortens the deadline. Cancelling one subscriber does not cancel other subscribers; cancelling the last one aborts the worker. Browser/context cleanup runs in finally, with a parent watchdog and descendant termination fallback. The child does not inherit database URLs, signing keys, proxy variables or Node preload settings. Parent checks cgroup memory every 500ms and rejects/stops work above 80% of the container limit or 768 MiB.

Railway service `841dcd14-965a-4906-9139-6968b588ffbe`, project `d2698ef3-e8d1-4ecb-956a-edd0aa4c9ca5`, production environment `6d493789-dd68-4334-bd3f-c2594e39229e`: observed memory limit about 1 GB, CPU limit 2, idle RSS/usage about 137 MB. These limits do not establish the billing plan or remaining credit. The connected tools did not provide billing/credit inspection or container exec. The optional Dockerfile.browser was prepared but was not selected/deployed; no new service or paid resource was created.

Local fixtures were run on actual Chromium 153 with Playwright 1.64.0. The usual Playwright browser download returned an unusable archive in this sandbox, so a separate local binary was used only for validation; it was not added as a project dependency. The Docker recipe/CI installs Playwright's pinned Chromium. Local aggregate RSS peaked at approximately 774 MiB for the entire npm + Node test runner + Chromium process tree; summed RSS double-counts shared pages and includes test tooling. This is NOT a measured Railway worker peak and does NOT certify the Free plan. Production image/resource verification remains required.

## Validation and production distinction

- TypeScript and lint passed; Next.js build and compiled client secret scan passed.
- Full local unit/contract run: 778 tests, 704 passed, 74 configuration-dependent skips, zero failures (includes browser manager/client-bound route coverage).
- Focused final provider/browser-route/cache/manager regressions: 84 passed, zero failures.
- Actual Chromium fixture suite: 34 passed, zero failures. Includes Download Links section scoping/unrelated sidebar rejection, undeclared same-provider popups/unsolicited CDN and document-header rejection, native 302 endpoint/CDN redirects, 403/429 redirect hops, static file target=_blank, and zero loopback connections from redirects/popups/workers/iframes, source/provider clicks, legitimate/ad popups, hx-get/data-hx-get, HX-Redirect/Location, direct final link, known CDN HEAD, invalid MIME/foreign host, passive Cloudflare JS, real challenge, 403/429 at source/provider/HTMX, human challenge in an HTTP-200 HTMX response, ad popup closure before file verification, no duplicate HTMX request, declared mirror fallback, and launch failure.
- Added manager tests cover 20-user deduplication, revision separation, subscriber cancellation, and barrier backoff. Route/cache tests cover grant expiry during work, source change during work, origin/client binding, one-use consumption, six-hour TTL and signed-cache rejection.
- Production dependency audit: zero vulnerabilities.
- Independent real 89-byte owner-created BZZHR canary attempted locally: FAILED with PROVIDER_DNS_FAILED at bzzhr_page / buzzheavier.com, before page opening or bytes. No browser download or hash verification occurred.
- Current Railway production logs independently show the OLD HTTP path failing at SteamRIP with HTTP 403 / PROVIDER_CHALLENGE. These logs do not validate the new browser engine.
- New Playwright code has NOT run on Railway. Full `Waleed Zone → SteamRIP → BZZHR → file → browser download` gate has NOT passed. There is no legitimate SteamRIP test page identified that declares the owner-created tiny QA file; direct-BZZHR testing alone cannot prove the full chain.

## Release status and required gates

Draft PR only: no merge and no new deployment. Keep the existing successful #63 deployment live and BACKGROUND_BROWSER_ENABLED unset. Latest pre-native-network GitHub CI also passed: 839 unit/contract cases (769 passed, 70 configured skips), 22 Chromium fixtures, 32 Admin API, 10 interoperability, 16 Admin browser, 18 Download UI flows and 102 integration cases. These are fixture/disposable-database gates, not a real-provider production pass. The final native-network commit must rerun the full workflow.

Before release: confirm actual plan/remaining no-cost credit, build/run the pinned image in existing Railway resources, measure cgroup peak during one real job, obtain an authorized SteamRIP-to-small-file source, and run the live canary from Railway with actual browser download + exact bytes/SHA-256. Any failure blocks activation/merge. Do not relabel fixtures or a direct-BZZHR pass as production success.

The expiring QA page `https://buzzheavier.com/724hyjkckpyu` was documented by the earlier owner-authorized work as an 89-byte public-domain fixture expiring 2026-10-12. `npm run test:browser-live -- <approved-source>` refuses to download unless HEAD declares exactly 89 bytes and then requires the known SHA-256. This is an operator-only test, not a permanent release gate after expiry.

## Changed files

- `src/lib/downloads/browser/engine.ts`, `policy.ts`, `native-network.ts`, `manager.ts`, `cache.ts`: native browser automation, allowlists, resource/IPC lifecycle, stable discovery.
- `scripts/browser-worker.cjs`, `scripts/test-browser-live.cjs`: isolated worker and real tiny-file canary.
- `src/lib/delivery/http.ts`, `src/app/api/downloads/legacy/status/route.ts`: gated integration and protected progress.
- `src/lib/downloads/providers/public-http.ts`, `bzzhr.ts`, `src/lib/downloads/http.ts`: precise challenge detection, final redirect path validation, clear failure messages.
- `src/components/download/LegacyDownloadExperience.tsx`, `src/lib/ui-en.json`: same-tab progress, cancellation, bilingual states.
- `migrations/007_provider_discovery.sql`, `scripts/migrate-provider-discovery.mjs`: additive checksum-tracked cache migration.
- `tests/browser/engine.cjs`, `tests/browser-manager.cjs`, `tests/browser-service.cjs`, `tests/provider-discovery.cjs`, `tests/monetization-migration.cjs`, `tests/download-processing-browser.mjs`: regressions, native cache migration checksum, and challenge-state compatibility.
- `package.json`, `package-lock.json`, `next.config.js`, `.github/workflows/integration.yml`, `Dockerfile.browser`, `.dockerignore`: pinned runtime dependency, CI/browser image preparation.

Primary references: https://playwright.dev/docs/network ; https://playwright.dev/docs/api/class-browsercontext ; https://docs.railway.com/pricing/plans ; https://docs.railway.com/builds/railpack .

## Follow-up diagnostics and canary hardening — 2026-10-09

Reconfirmed main `0bfa6faab2e6ad5974f54ee5e6b867edeaf6f30b` and draft PR #64 head `0fcf18f62f9ce1460c49ff134634d9ce0d115fbd`. Both workflows at that baseline remain successful. Production deployment `140ad3c5-49fc-4abf-8ff8-6ad13c0cab3d` is SUCCESS, uses main/Railpack, and has no BACKGROUND_BROWSER_ENABLED variable. The bot remains unchanged and healthy. The project currently has only a production environment, no shared environment variables, and no pending staged changes.

Local DNS investigation: OS `getaddrinfo`/Node lookup returns EAI_AGAIN for SteamRIP, buzzheavier.com, bzzhr.co, ts.bzzhr.co **and the control example.com**. Node resolve4/resolve6 independently return ECONNREFUSED. The real tiny-file canary fails before launching Chromium: `PROVIDER_DNS_FAILED`, safe resolver code `EAI_AGAIN`, stage `bzzhr_page`, host `buzzheavier.com`. This establishes a local resolver/network restriction; it does not establish an expired page, Chromium flag conflict or Railway resolver failure. No resolver, proxy or SSRF-policy override was added.

Railway's existing production DNS logs show SteamRIP A/AAAA NOERROR on 2026-10-09 at 15:35:27Z and buzzheavier.com A/AAAA NOERROR on 2026-10-08 at 09:39:54Z. The latter is historical evidence, not a fresh browser check. Current web-service resources: about 0.134 GB idle memory, about 0 CPU, 1 GB memory limit / 2 CPU limit. These are **not Chromium measurements** and do not prove a billing plan or remaining credit.

Fixed a real diagnostic gap: optional provider-host DNS failures were silently discarded during pin preparation. An actually requested provider page/endpoint now fails before native I/O with its precise stage, host, and a finite safe resolver code. There is still no unpinned connection or second DNS fallback. Initial failures never launch Chromium; private/mixed/family-mismatched answers still fail closed. Worker IPC and parent logs carry only recognized resolver codes, never raw errors or addresses.

Hardened the operator-only canary: bind the owner-created file ID and expiry, require HEAD **and actual GET response** to declare exactly 89 bytes, plain/octet-stream MIME, identity encoding, and attachment disposition. GET uses the final revalidated HEAD destination and CDP checks each request/response before accepting its body. Undeclared redirects, HTML, changed lengths and other files cannot be downloaded. Actual bytes and known SHA-256 remain required for PASS; HEAD/fixtures alone cannot produce it.

Prepared `Dockerfile.browser-canary` and `scripts/run-browser-canary.cjs` for a one-shot, credential-free isolated runtime test. It refuses production DB/signing/stats credentials, never serves web traffic, runs bounded DNS and data-page Chromium smoke checks followed by the authorized real canary, and records sampled whole-container memory/CPU separately from production. Runtime use still requires budget/credit verification and restart policy NEVER.

Prepared a separate `Dockerfile.browser-canary-build` for a **free build-only** Railway check. Railway's current pricing docs explicitly state that build CPU/memory/image downloads/exports/storage are free. Its final RUN always exits nonzero after emitting `NO_RUNTIME_DEPLOYMENT_BY_DESIGN`, even when tests pass, so no runtime deployment can start or consume paid credits. This can establish Chromium/image/build-network behavior, but **cannot certify Railway runtime egress, production worker peak memory, source-to-user delivery or production readiness**. No secrets, DB reference, volume or domain are needed. Build-only results will be recorded in PR #64 when observed, never relabeled as a runtime pass.

There is still no authorized SteamRIP game page declaring this tiny file. A BZZHR-only pass, even on Railway, cannot prove the full chain. PR #64 must remain draft, unmerged and disabled until an authorized complete-chain source plus runtime/resource gates pass.
