# Owner dashboard UI — Agent Q / issue #41

Base: `de173adb36f160bf769e41c656ca0e7fe7fbbdf0` (current main / Phase 4 integration). Branch: `agent/admin-dashboard-ui`.

## Integration dependency — read before merging

At implementation time `agent/admin-backend-owner-api` still pointed at that base and no `/api/admin` handlers or published admin HTTP contract existed. **The HTTP contract below is the frontend's integration target, not a claim that Agent P implemented it.** This PR supplies only UI, a strict client adapter, and isolated fixture tests. The integration owner must reconcile `src/components/admin/api.ts` with Agent P's final endpoints/DTOs/CSRF contract, then run real owner/non-owner and mutation tests on a disposable database. Until then, absent/malformed admin endpoints show an explicit unavailable state and writes are locked. Do not merge this UI as an operational admin system without that reconciliation.

No backend handlers, authorization primitives, migration, deployment/environment flags, storage provider configuration, APK transfer, public catalog/search/SEO, or public layout were changed.

## Screens

These are sections within `/admin`, with addressable hash navigation and browser back/forward support:

| URL | Screen |
| --- | --- |
| `/admin#overview` | Overview, catalog count, per-app version/verified-file counts, independent global gates |
| `/admin#applications` | Read-only paginated app list, icon/name, recorded legacy/direct/disabled mode, app selection |
| `/admin#configuration` | App selector, current version/file states, config form, explicit direct blockers |
| `/admin#versions` | Version list; create pending version or edit metadata/state of a selected version |
| `/admin#files` | Sanitized file list and pending-only file metadata creation form |
| `/admin#system` | Gate status and read-only budget period/limit/reservations |
| `/admin#kill-switch` | Read current shared switch, explicit confirmation, disable-only control |

The `/admin` page and layout both call the existing `requireOwner()`. No new auth implementation or test bypass exists in production. The existing `next.config.js` supplies private/no-store and noindex headers; existing sitemap/robots remain unchanged. Anonymous production smoke testing renders the existing not-found UI and no dashboard data/form. The current root layout can stream its public chrome before a nested `notFound()`, so the transport can be HTTP 200 with a 404 UI; this PR does not change the shared root access layer. Independent owner authorization on every admin API remains Agent P's responsibility.

## Client contract to reconcile with Agent P

All calls use fixed relative paths, `credentials: same-origin`, `cache: no-store`, `redirect: error`, JSON, and a 12-second timeout. Read requests are abortable and stale app responses are discarded. Writes carry an in-memory `X-CSRF-Token` from the owner-protected CSRF read. Never persist the token in browser storage or accept response-provided URLs as endpoints. Successful responses must be JSON objects; mutations are confirmed by fresh status/app/catalog reads before any success message. A failed confirmation locks further writes and asks for a reread; mutations are never automatically retried.

| Method | Proposed endpoint | Body/response |
| --- | --- | --- |
| GET | `/api/admin/csrf` | `{csrf_token: string}`; 32–256 URL-safe characters, memory only |
| GET | `/api/admin/applications?page=1&limit=50` | `{applications: AdminApplication[], total: number}` |
| GET | `/api/admin/applications/{application_id}` | `{application, versions, files, blockers: string[], direct_activation_allowed: boolean}` |
| GET | `/api/admin/downloads/status` | `AdminStatus` below |
| POST | `/api/admin/downloads/versions` | `{application_id, version_label, release_key, active, published}`; new records pending/inactive/unpublished |
| PATCH | `/api/admin/downloads/versions/{uuid}` | Same body; app/version relationship must be enforced in server |
| POST | `/api/admin/downloads/files` | File metadata body below; pending/inactive only, no scan promotion via client |
| PUT | `/api/admin/downloads/config/{application_id}` | `{mode: legacy\|direct\|disabled, current_version_id: uuid\|null}` |
| POST | `/api/admin/downloads/control` | `{enabled: false}` only; no re-enable button |

`AdminApplication`: `{application_id: number, name: string, icon_url: string|null, mode, current_version_id: uuid|null}`.

`Version`: `{id: uuid, application_id: number, version_label, release_key, active: boolean, published: boolean}`.

`File` read DTO: `{id: uuid, version_id: uuid, variant_key, download_filename, size_bytes: number, mime_type, scan_status: pending|verified|quarantined|failed, active: boolean, retired_at: timestamp|null}`. Private storage references and hashes are deliberately absent from the presentation model; unrecognized response properties are dropped rather than passed through.

File creation body: `{version_id, variant_key, artifact_type: "apk", size_bytes, sha256, mime_type: "application/vnd.android.package-archive", download_filename, storage_backend, storage_key, storage_object_version: string|null}`. The private object reference is entered only in a labeled disclosure for this operation, not read back or displayed in file cards. This is necessary metadata, not a signed URL or credential. Provider version/immutable-key/exact-file-UUID rules must be enforced by the final backend; if Agent P requires an explicit planned UUID or different provider IDs, adapt this form before integration. No scan attestation or verification claim is made from a user-entered SHA-256. No upload input exists.

`AdminStatus`: `{checked_at: timestamp, enabled: boolean, deployment_enabled: boolean, migration_ready: boolean, storage_ready: boolean, ingress_ready: boolean, blockers: string[], budget: null|{allowance_verified: boolean, byte_limit: number, reserved_bytes: number, starts_at: timestamp, expires_at: timestamp}}`. DTO integers must be safely representable JSON numbers. Missing/invalid fields reject the response; no ready defaults. Budget validity is evaluated against server `checked_at`. Unknown blocker codes map to a safe generic explanation, never raw server diagnostic text. Safe known codes include `DIRECT_ACTIVATION_BLOCKED`, `MIGRATION_REQUIRED`, `DEPLOYMENT_DISABLED`, `DOWNLOADS_DISABLED`, `STORAGE_UNAVAILABLE`, `INGRESS_UNVERIFIED`, `BUDGET_UNVERIFIED`, `BUDGET_EXHAUSTED`, `VERSION_REQUIRED`, `VERSION_INACTIVE`, `VERSION_UNPUBLISHED`, `FILE_UNVERIFIED`, `FILE_INACTIVE`, `APP_UNPUBLISHED`.

**Keep Phase 4's direct activation stop:** the backend should return `direct_activation_allowed: false` and its blocker until independently reviewed rollout authorization. Even when the recorded mode is direct, the UI shows recorded state separately from delivery gates. Eligibility requires explicit server permission, every global gate, a current valid budget, a selected active/published version and a verified/active/non-retired file; unknown state denies activation. The backend must recheck every gate at write time. The UI checks are user guidance, not security enforcement.

## UX and accessibility

Scoped CSS uses existing charcoal/cyan tokens. Mobile sections use a compact grid; desktop uses a sticky sidebar. App names/file names wrap. Keyboard navigation preserves native link behavior within the app, section activation focuses its heading, form errors use a focused alert, all fields have labels, disclosures open for invalid hidden required controls, and controls use the shared focus ring. Loading skeletons represent unknown data only; empty/error/401/403/404/409/429/503 states have concrete messages. Budget is read-only; no invented free allowance. A second mutation is blocked while saving/rechecking.

## Verification

Use supported Node 20.19.5 and existing project dependencies:

```sh
npm run typecheck
npm run lint
npm test
npm run build
WZ_BROWSER_MODULE=/path/to/playwright/index.mjs \
  WZ_BROWSER_EXECUTABLE=/path/to/chromium-or-headless-shell \
  WZ_AXE_MODULE=/path/to/axe-core/axe.min.js \
  node scripts/test-admin-ui.mjs
```

`WZ_AXE_MODULE` is optional. Browser tooling is installed separately; no app/runtime dependency was added. The script creates a disposable Next fixture outside this repository and copies the dashboard into it. Only the fixture omits the auth layout; production routes cannot request it via a query parameter or environment flag. Playwright mocks the proposed HTTP contract, never a production DB/provider. This verifies UI, **not** Agent P's server or live integration.

The browser run passed 48 checks at 360/768/1440px: seven-section navigation, state rendering, disabled direct, config/version/file saves with authoritative rereads, invalid SHA focus, labels/keyboard section focus, stale app response isolation, disable-only confirmation, failed write confirmation, six error statuses, empty state, no private error/metadata rendering, no page errors/overflow. Axe WCAG 2/2.1 A/AA checks passed for overview, configuration and files at all three widths. Screenshots are in `docs/screenshots/admin-ui/` and were visually inspected. The optional agent-browser daemon could not start in this container; Playwright with the installed headless-shell succeeded.

Local full tests use the project's built-in disposable mocks/PGlite path. Native PostgreSQL integration cases skip without their explicit disposable DB variables; do not report those as locally executed. Existing CI runs those native tests. The UI browser suite is intentionally standalone and does not modify other agents' workflows.

Final local result: typecheck, lint and build passed; `npm test` reported 403 tests, 356 passed, 47 native/disposable-DB cases skipped, zero failures. The six admin unit tests also passed after the final icon/CSRF adapter hardening. The final browser rerun passed all 48 checks and the optional axe checks. This is frontend readiness with the integration dependency above, not a production rollout.
