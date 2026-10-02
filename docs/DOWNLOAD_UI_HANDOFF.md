# Agent H: Phase 3 download frontend

Issue: [#19](https://github.com/waleednjlaty/Waleed-zone-wab/issues/19). Branch: `agent/phase3-download-ui`.
Baseline: `7264a93` (integrated Phase 2). Contract: [DOWNLOAD_SYSTEM_SPEC.md](DOWNLOAD_SYSTEM_SPEC.md), section 5.

## Delivered behavior

`/download/<application-id>` reads the existing public catalog and presents an app icon/name plus version, exact file size and optional artifact type when file metadata is available. Navigation never admits a request. Explicit preparation calls session bootstrap, then request admission with a random UUID idempotency key. A server-relative monotonic countdown shows `20 → 19 → …` and a progress bar; it never uses skeletons. Token issuance still has to succeed before READY. The route loading fallback is reserved for unknown page data.

All nine UI states are implemented: INITIAL, LOADING, COUNTDOWN, READY, DOWNLOADING, RATE_LIMITED, EXPIRED, FAILED and SUCCESS. Admission/token/status 429 responses use the longest Retry-After/envelope wait, visibly disable retry, and stop automatic retry. A 425 resynchronizes the countdown. Network retries preserve the admission idempotency key; CSRF failures obtain a fresh bootstrap on explicit retry. Expired tokens can be rotated on a still-valid request; expired/consumed/exhausted requests need new admission and a new countdown.

Redemption is a synchronous native form POST to `/api/downloads/redeem`, initiated by the user's click in a separate tab. It sends `request_id`, `token`, `csrf_token`; it never fetches file bytes or builds an APK Blob. The raw token/CSRF stay in memory and hidden form fields. Only a public request ID/idempotency key can be saved in sessionStorage to recover after reload. Duplicate admission clicks and duplicate form submissions are guarded synchronously.

The original page performs one bound status read after submission. SUCCESS requires `state=redeemed` and says the request was handed off; it never claims a completed file transfer. Native redemption errors are owned by the API's accessible HTML response per section 5.6, in the new tab, including the machine error code, HTTP status, Retry-After and return link. The original page cannot read that tab with `noopener noreferrer`; if status remains unredeemed it shows recovery instructions instead of inventing a success/error status. The backend's 429 HTML should clearly display its server wait. Real delivery/CSP/mobile verification remains a release gate below.

RTL layouts reuse the existing color, typography, border and button tokens. No UI dependency or global design-system change. Keyboard admission and redemption, focus on actionable state headings, a polite live status with countdown milestones, readable timer digits, progress semantics and reduced motion are included. Primary and sticky details CTAs use the same internal destination for mapped files; legacy destinations retain their original behavior.

## File metadata integration seam (required before rollout)

The current specification defines mutation/status endpoints but **does not define a public eligible-file metadata endpoint or existing server reader**. Catalog `version`/formatted `size`, legacy shortener URLs and curated history cannot select trusted version/file UUIDs. This frontend PR deliberately adds no backend reader, API or DB logic.

`DownloadExperience` takes a `DownloadApp` and `DownloadFile | null`. `getDownloadPresentation(applicationId)` is the isolated, read-only presentation seam used by both the download page and details CTA. Its `src/data/download-presentation.json` is intentionally `{}`: no dummy/public-production artifacts and no unverified automatic migration. As shipped on this baseline, pages truthfully show unavailable and existing details CTAs stay operational.

The integration agent should replace that seam with the backend's **public eligible-file DTO**, including verified app/global gates, or populate its public presentation map only for verified rollout files after gates are ready. A `DownloadFile` contains only:

| Field | Meaning |
|---|---|
| `application_id` | Existing positive catalog integer |
| `version_id`, `file_id` | Public UUID selectors for the exact parent chain |
| `version` | File's real version display label |
| `size_bytes` | Positive safe integer for the actual file |
| `file_type` | Optional `apk/apks/xapk/obb/zip` |

Never put storage keys, endpoints, signed URLs or credentials in that DTO/map. These public selectors are **not authorization**; server checks on every request/token/redeem remain authoritative. A withdrawn file may race a rendered CTA, so API errors remain fail-closed. Both app and game details already share the CTA component. No query-supplied token/file metadata is trusted by this route.

## Validation and reproduction

Validated with Node **20.19.6**, the repository's supported major:

- Production build (including lint/type validation) and explicit typecheck pass.
- Unit suite: 55 passed, 34 existing DB integration cases skipped without a configured disposable PostgreSQL fixture. No production DB used.
- Frontend browser suite: 18 isolated Chromium flows at 360/768/1440px: native POST, all relevant transitions, server waits, no skeleton countdown, keyboard/focus, reduced motion, no overflow/runtime exceptions, reload recovery, CSRF refresh, request response loss/idempotency, bounded token retry, expiry, duplicate clicks, unavailable files and both detail CTA surfaces.
- Browser fixture uses the actual components/CSS in a disposable Next.js project, mocked API contracts and a tiny text attachment. **No backend correctness, production storage availability, real APK delivery or provider budget claim is made.**

Run normal checks with `npm run typecheck`, `npm test`, `npm run build`. For the frontend browser suite, use an existing Playwright installation (no production dependency):

```bash
WZ_BROWSER_MODULE=/absolute/path/to/playwright/index.mjs \
WZ_BROWSER_EXECUTABLE=/absolute/path/to/chromium-or-headless-shell \
node scripts/test-download-ui.mjs
```

Optionally set `WZ_DOWNLOAD_SCREENSHOTS` to an output directory. `WZ_AGENT_BROWSER` enables an additional CLI dev-surface check. The CLI's Unix socket daemon is unavailable in this execution environment; Chromium headless shell/Playwright provided browser verification. No fixture route is installed in the production application.

Before actual enablement, the integration agent must verify the native POST → external 303 against the existing `form-action 'self'` CSP and real approved delivery host, browser popup/download policies (including Android/iOS), backend cookie/session contract, eligible-file presentation, kill switch and real adapter. This PR does not relax CSP or provision services to resolve those integration gates.

## Screens (disposable UI fixture, placeholder app icon)

| Screen | Capture |
|---|---|
| 360px INITIAL | [image](screenshots/download-ui/download-360-initial.png) |
| 360px COUNTDOWN | [image](screenshots/download-ui/download-360-countdown.png) |
| 360px READY | [image](screenshots/download-ui/download-360-ready.png) |
| 360px RATE_LIMITED | [image](screenshots/download-ui/download-360-rate-limited.png) |
| 360px EXPIRED | [image](screenshots/download-ui/download-360-expired.png) |
| 360px SUCCESS | [image](screenshots/download-ui/download-360-success.png) |
| 768px COUNTDOWN / READY | [countdown](screenshots/download-ui/download-768-countdown.png) · [ready](screenshots/download-ui/download-768-ready.png) |
| 1440px COUNTDOWN / READY | [countdown](screenshots/download-ui/download-1440-countdown.png) · [ready](screenshots/download-ui/download-1440-ready.png) |

Runtime changes are limited to `src/app/download/[id]/*`, `src/components/download/*`, the empty public presentation map, and the existing detail CTA wiring. No DB/schema, API implementation, search, auth/authorization, backend limiter, cloud/storage, package dependencies or deployment settings changed.
