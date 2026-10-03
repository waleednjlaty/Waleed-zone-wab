# Phase 8 security review

Scope: website main `bb96f53243520a7cac68f7ccc74ee823aa88211d` and bot main `5544b6f67b4867b35d68ed6e1178d4fd72b3c881`. Changes are on `agent/phase8-security-performance` in each repository. This is evidence from fixtures and local tests, not a claim that production is fully protected.

No production database, migration, deployment, environment, Telegram publication, owner identity or paid infrastructure was changed. Direct storage stays disabled. Architecture remains shared PostgreSQL, Telegram `copy_message`, public files channel, website countdown, native POST and exact 303.

## Threat model and authority

Assets: owner catalog authority, password/session hashes, database/signing/bot/stats credentials, source integrity, availability and shared revisions. Attackers include anonymous clients, ordinary accounts, forged Telegram callbacks/FSM events, malicious stored metadata and remote download/image pages. Database credentials, Telegram administrators and the release environment are privileged trust boundaries.

`requireOwner()` and `authorizeOwnerRequest()` remain the website authority on every admin request. A stats bearer never grants mutation rights. `ADMIN_IDS` remains bot catalog authority; explicit handler guards supplement middleware so a forged state does not bypass it. Existing group moderation separately checks bot owner or actual Telegram group administrator; ordinary members cannot invoke moderation commands. No identity was changed.

## Implemented mitigations and evidence

| Area | Change / evidence |
|---|---|
| Auth | Existing scrypt, dummy password work for absent users and timing-safe comparison retained. Atomic persistent identity/network limits; random session replacement transaction removes the prior browser session. Strict token format, server expiry, hashed storage, logout deletion. Production `__Host-`, Secure, HttpOnly, SameSite=Lax, Path=/ cookies checked over local HTTPS. Anonymous/non-owner/expired/forged owner denied. |
| Admin / CSRF / IDOR | Existing owner authority, exact origin and session-bound CSRF enforced before writes. Strict field allowlists, size limits, fatal UTF-8, malformed JSON/form/media rejection, integer/UUID validation and revision conflicts retained/tested. A 5-second stream deadline now cancels stalled bodies. Owner quota is shared in PostgreSQL. No-cache/noindex private HTML/API retained; browser/RSC/client asset checks exercise real owner routes. |
| Downloads | HMAC signatures remain timing-safe; oversized/malformed/signed-null tokens fail. A single joined statement observes publication/config/source consistently. Revision fingerprint binds the grant to exact destination and application revision without exposing the internal revision value. Removal/replacement/unpublish/archive during countdown invalidates the original grant. Precise tests deny 19.999 seconds and allow 20.000. |
| Telegram destination | Existing strict parser permits HTTPS, exact `t.me`, configured public channel, positive message ID and exact channel/message path; credentials/query/fragment/other hosts are denied. Destination and Telegram file identifiers are absent from pre-redeem public HTML, RSC and JSON. Native browser POST receives 303 to the exact message; the final Telegram response is intercepted locally. |
| Bot | Every privileged upload/admin/SteamRIP handler independently checks `ADMIN_IDS` before FSM reads/changes. Known positive file size is checked before channel lookup/copy. Public username, optional resolved ID pin, protected source/channel and bot posting authority are checked. Telegram lookup/copy calls have deadlines. Copy failure returns no metadata; normal APK storage never calls get_file/download/proxy/local file APIs. |
| SSRF | SteamRIP source and size fallback use bounded HTTPS fetches, manual redirects, finite source hosts, public-only DNS results pinned into the connection resolver, no environment proxy and an overall deadline. Private/loopback/link-local/metadata/IPv4-mapped private addresses, mixed DNS and scheme/credential/port tricks are tested. ImgBB image fallback shares the guard and accepts bounded raster MIME only. BZZHR curl pins DNS and limits signed endpoint authority; browser fallback pins finite hosts and rejects other routes/resources. Unverified BZZHR proxy is refused. |
| XSS | React escaping and safe JSON-LD retained. Unsafe image schemes, credentials, private literal hosts and control/bidi characters rejected. Per-response CSP nonce covers Next inline scripts and JSON-LD; production script policy has no unsafe-inline/unsafe-eval. Stored script/img/SVG and reflected input are exercised in real Chromium without execution. |
| Headers | nosniff, frame-ancestors none / DENY, restrictive permissions, COOP same-origin, CORP same-origin, referrer policy and conditional HTTPS HSTS. Actual response policies and native download/auth/admin behavior checked. Styles retain unsafe-inline for existing UI; Ads gates retain finite script/frame authorities. Development alone allows unsafe-eval for Next tooling. Static assets excluded from middleware retain the fallback header policy. |
| SQL / concurrency | Bound parameters and fixed SQL identifiers; existing owner row locks, revision triggers and SQLAlchemy version checks retained. Website/bot stale writes and source binding races exercised on disposable native PostgreSQL. View/download counters do not change catalog revision. Connection/statement/lock deadlines added. No DDL in production request/startup paths. |
| Errors / logs | Public errors contain generic messages/codes, not exceptions/SQL/stacks. Unknown admin failures log code-only redacted objects. Reusable website recursive redaction and bot logging formatter cover env credentials, Authorization/Cookie/passwords, DB/proxy credentials, signed URL queries and Telegram API/file URLs; tests include quoted multi-cookie headers. Pydantic config repr/validation hides input secrets. |
| Dependencies | Installed production npm dependencies: zero audit advisories. Installed bot requirements: zero pip-audit advisories at review time. No framework major upgrade, paid service or dependency added to application runtime. Bot broad version ranges remain a reproducibility limitation. |

## Environment inventory and exposure boundary

Only names are recorded; no deployed values were read or printed. Review covers tracked source/tests/docs, API error/log sites, compiled browser assets, actual local HTML/RSC/JSON and browser requests. A synthetic fixture token or fake database credential in a test is not a production credential. The browser build scanner is included in CI after build; it checks prohibited private env references, Telegram file/API URLs, PostgreSQL URLs, signed S3 query parameters and any supplied known private values. It rejects secret-like `NEXT_PUBLIC_*` names. Local HTML/network tests use random fixture secrets to detect accidental serialization. This cannot prove an exposed historical screenshot credential was revoked; manual rotation remains necessary.

| Website variable(s) | Boundary / use |
|---|---|
| `DATABASE_URL` | Server DB pool only; never browser output. |
| `OWNER_USER_ID` | Server authorization only. Account display may show the user's name/email, never this configured authority identifier. |
| `LEGACY_DOWNLOAD_SIGNING_KEY`, `WEBSITE_STATS_TOKEN`, `VISIT_KEY_SALT` | Server-only signing, read-only stats bearer, visit pseudonym salt. |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Intentionally public origin/site verification. No secrets permitted in their prefix. |
| `ADSENSE_PUBLISHER_ID`, `ADSENSE_CONTENT_REVIEWED`, `ADSENSE_ENABLED` | Public publisher identity; only approved/enabled configuration loads existing ad scripts. Ads-enabled third-party behavior was not tested against live Google. |
| `FILES_CHANNEL_USERNAME`, `CHANNEL_USERNAME` | Public channel configuration; exact file message is released only by validated redeem. No BOT_TOKEN in website runtime. |
| `LEGACY_DOWNLOAD_ALLOWED_HOSTS` | Exact existing legacy redirect hosts; default DevUploads/ShrinkMe maintained for old rows. |
| `DIRECT_DOWNLOADS_ENABLED`, `DOWNLOAD_ALLOWED_DELIVERY_HOSTS` | Existing disabled direct-storage gate and finite hosts. |
| `DOWNLOAD_INGRESS_VERIFIED`, `DOWNLOAD_TRUSTED_IP_HEADER`, `DOWNLOAD_IP_HASH_KEY`, `DOWNLOAD_IP_HASH_PREVIOUS_KEY`, `DOWNLOAD_IP_HASH_OVERLAP_UNTIL` | Private/operator-verified ingress and quota identity. Caller XFF/X-real-IP never selects a trusted bucket. |
| `DOWNLOAD_STORAGE_BACKEND`, `DOWNLOAD_STORAGE_PROVIDER_VERIFIED` | Existing server storage adapter gates; remain unenabled. |
| `DOWNLOAD_S3_ENDPOINT`, `DOWNLOAD_S3_REGION`, `DOWNLOAD_S3_BUCKET`, `DOWNLOAD_S3_ACCESS_KEY_ID`, `DOWNLOAD_S3_SECRET_ACCESS_KEY`, `DOWNLOAD_S3_FORCE_PATH_STYLE`, `DOWNLOAD_S3_VERSIONING_ENABLED`, `DOWNLOAD_S3_CHECKSUM_SOURCE`, `DOWNLOAD_S3_TIMEOUT_MS` | Server-only existing optional S3 settings; no bucket/credentials/provisioning added. |
| `DOWNLOAD_METADATA_DATABASE_URL` | Explicit operator CLI only; test naming/loopback restrictions, no automatic DATABASE_URL fallback. |
| `NODE_ENV`, test/CI `WZ_*`, `NEXT_TELEMETRY_DISABLED` | Runtime/tooling controls; never authorization overrides. Tests use separate local databases. |

| Bot variable(s) | Boundary / use |
|---|---|
| `BOT_TOKEN`, `DATABASE_URL`, `IMGBB_API_KEY`, `WEBSITE_STATS_TOKEN` | Private runtime credentials, config repr/logs redacted. Website receives only the independent stats bearer. |
| `ADMIN_IDS` | Catalog authority, never derived from callbacks/FSM. |
| `FILES_CHANNEL_ID`, `FILES_CHANNEL_USERNAME`, fallback `CHANNEL_ID`, `CHANNEL_USERNAME` | Public file channel resolved/verified on copy; username required, configured ID must match. |
| `GROUP_ID`, `GROUP_USERNAME` | Group integration/configuration. |
| `WEBSITE_BASE_URL`, `WEBSITE_STATS_URL` | Operator origin/endpoints, stats client 8s timeout and no redirect following; bearer not printed. |
| `MAX_UPLOAD_BYTES`, `HTTP_MAX_RETRIES`, `DOWNLOAD_DIR` | Bounded upload/retry/local legacy tooling settings; normal Telegram copy does not use local APK disk. |
| `BZZHR_PROXY_URL`, `IMGBB_PROXY_URL` | Private operator proxy config. BZZHR proxy now refused pending independently verified egress protection; ImgBB fixed upload endpoint can use its existing configured proxy. |
| `SCRAPLING_EXECUTABLE_PATH` | Trusted operator executable path; not user-controlled. |
| `PYTHONIOENCODING`, `PYTHONUTF8`, test fixtures | CLI/tooling only. |

Application IDs necessarily appear in public catalog/download URLs. Owner-only source screens intentionally show the public channel/message ID after owner authorization. Database row internals, file IDs and private storage identifiers are not public catalog fields.

## Quotas, replay and zero-cost limits

Shared PostgreSQL `site_rate_limits` is the authority across instances. One atomic UPSERT charges each scope; hashes bound key size, counters saturate, and probabilistic cleanup deletes at most 100 expired-day rows. A process-local early shed supplements legacy endpoints, never substitutes for the global checks. Failure of the limiter/database fails closed. No Redis or external service added.

| Scope | Limit |
|---|---|
| Login identity | 8 / 15 minutes; unknown-user password work retained |
| Registration identity | 5 / hour |
| Favorites user | 60 / hour; session principal selected server-side |
| Verified auth network | 4 times the identity limit per corresponding window |
| Unverified ingress fallback | Shared login 240 / 15 min; register 60 / hour |
| Legacy prepare/redeem network | Shared 600 / min or verified network 120 / min |
| Legacy client | prepare 30 / min; redeem 60 / min |
| Search / visits | 600 / min per verified network or shared fallback |
| Stats | 120 / min; bearer/owner authority retained |
| Admin owner | reads 300 / min; writes 60 / min |

These are moderate admission limits, not a DDoS guarantee. Shared fallback can cause cross-user contention without a proven ingress header; client cookies are renewable, so network/shared quota is also required. Identity throttles can be used to inconvenience a targeted account. Fixed windows permit boundary bursts. The PostgreSQL writes/hot keys add load under sustained attack; DB pool size 1, deadlines and bounded cleanup constrain application work but cannot stop network saturation. HTML search requests already use bounded input/candidates and DB statement deadlines; API quota alone does not throttle every server-rendered search URL. Verify actual Railway proxy overwrite behavior before enabling ingress flags. Do not accept raw XFF for performance.

Legacy grants intentionally remain stateless and reusable by the same client during the 180-second redeem window after the server's 20-second delay (200 seconds total). Multi-tab/parallel requests, same/different client, wrong app/revision/nonce/signature and expiry are covered by unit/HTTP tests. Replay is bounded by quotas and current publication/source validation; it may count repeated clicks. A single-use request table would add writes without hiding the already public file, so it was not added. Native redeem reads a committed statement snapshot: an edit committed after that decision cannot recall an already emitted redirect.

Public Telegram files are not confidential. Anyone who learns the message URL can redistribute it or bypass later countdowns; it is not DRM. Telegram may delete a message/file or rename a channel after binding. The website intentionally has no bot credential to continuously prove Telegram existence. Lookup/copy-time wrong ID/username/private/protected/not-admin/copy failure cases are mocked; subsequent external deletion/rename requires manual owner rebind/unpublish. No live canary or destructive test was run.

BZZHR final public CDN hostnames can change; HTTPS destination parsing rejects credentials, controls, nonstandard ports and private literals. Returned browser destinations are not server-fetched. The third-party page/Cloudflare flow can change and now fails closed when it requests hosts outside the pinned browser set. Local mocks verify extraction and protections; no claim of live provider success. Dormant DevUploads/ShrinkMe and operator image-migration tooling remain for old data; normal uploads no longer use them.

## Database/runtime release assumptions

PostgreSQL schema/revision triggers from prior phases must already exist. Apply/verify additive `003_runtime_security.sql` manually **before a later authorized release** because lazy auth/visit DDL is removed. It preserves rows and creates limiter/session cleanup support. Optional `004_phase8_indexes.sql` is justified by disposable EXPLAIN evidence; run CONCURRENTLY outside a transaction, inspect existing definitions/size first, and confirm native query plans. Neither migration was run in production. Bot startup performs read-only PostgreSQL schema verification and fails if required catalog/source columns are absent; SQLite create_all stays local/test-only.

Website connection statement timeout 5s, lock timeout 2s, idle transaction 10s; bot connect/command timeout 10s, statement 5s, lock 2s, idle transaction 120s accommodates existing bounded network work in handlers. This does not redesign transaction architecture; long provider operations inside a bot transaction remain an operational bottleneck. Railway public origin must be HTTPS for Secure cookies, CSP upgrade/HSTS; HSTS is only emitted for configured production HTTPS, without includeSubDomains/preload. Node 20.19.5 and Python 3.11 are the checked runtime versions. Runtime secret updates require coordinated process restarts. Nonce CSP keeps pages dynamically rendered; private responses/grants never gain shared cache.

No new required environment variable. Previously exposed secrets require manual changes/restarts using [SECRET_ROTATION_RUNBOOK.md](SECRET_ROTATION_RUNBOOK.md); do not rotate owner identity. Review nonempty BZZHR proxy config before a later release.

## Validation evidence and reproduction

Website: npm ci, typecheck, lint, test, production build, integration and npm audit --omit=dev were run. Unit suite: **569 passed / 0 failed / 69 skipped (638 total)**; skips are opt-in HTTP/native database contracts, exercised separately. Native download/metadata/admin concurrency suites: **111 passed / 0 failed / 0 skipped**. Real production HTTPS API suite: **98 passed / 0 failed / 0 skipped**. Additional admin HTTP fixture: **16 passed / 0 failed / 0 skipped**. Final auth/admin targeted regression: **78 passed / 0 failed / 0 skipped**. Fresh client scan: **77 files**, no private values printed. Conditional S3 live tests remain skipped; direct storage is disabled and no real bucket was contacted.

Browser at **360 / 768 / 1440**: public navigation 24 flows, SEO 21 checks, real Telegram/catalog 42 checks, admin/public security 30 flows, native PostgreSQL owner UI 30 checks, adversarial stored/reflected/XSS/image-input/auth-cookie suite **39 checks**. Secure __Host- deletion is tested both in HTTP headers and Chromium's cookie jar. Browser suites block/intercept all external file/provider requests. Local self-signed TLS relaxation is confined to fixture processes, never production code.

Cross-repo fixture proves website draft → Python bot read/bind/edit/publish → immediately visible website/search, real shared revision conflicts in both directions, counter writes preserving revision, and native countdown → exact 303 after 20 seconds. Set **both** `WZ_BOT_TEST_PYTHON` and `WZ_BOT_REPOSITORY`; never a production DATABASE_URL. The harness only accepts an empty named literal-loopback test DB and does not reset existing databases.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
node scripts/scan-client-secrets.mjs
# Precreate an EMPTY local wz_phase2_test_<suffix> database.
WZ_TEST_DATABASE_URL=postgres://test_user@127.0.0.1:5432/wz_phase2_test_phase8 \
 WZ_BOT_TEST_PYTHON=/path/to/bot/.venv/bin/python WZ_BOT_REPOSITORY=/path/to/bot \
 WZ_BROWSER_TESTS=true WZ_SEO_FIXTURES=true WZ_BROWSER_MODULE=/path/to/playwright/index.mjs \
 npm run test:integration
npm audit --omit=dev
```

Bot: compileall and **132 pytest passed / 0 failed / 0 skipped**. pip-audit of installed requirements found zero known advisories. The seven security/helper files have clean Ruff checks; full existing lint has **166 findings versus 187 on original main**, largely pre-existing style/import debt, not claimed as a passing full-repo lint. No rule was disabled. Run:

```sh
python -m compileall -q app config database integrations main.py
pytest -q
ruff check app config database integrations main.py
pip-audit -r requirements.txt
```

## Manual production checks (operator, separate authorization)

Before releasing, review schema/table privileges and optional index plans, current HTTPS/proxy assumptions, BZZHR proxy use, DB timeout suitability, stats token alignment and secret rotation runbook. Preserve direct=false. Confirm anonymous/non-owner admin denial, owner read/noindex/no-store, no provider details in public HTML/RSC/assets/errors, healthy auth logout, immediate bot catalog visibility and existing canary's exact destination. Any mutation, publishing, migration or deployment requires a later authorized operator action; none was performed here. Watch code-only errors, 429/503 rates and pool wait time. Roll back application commits if needed; additive schema can remain, and key rollback implications are documented separately.

References: [Next CSP nonces](https://nextjs.org/docs/app/guides/content-security-policy), [PostgreSQL timeouts](https://www.postgresql.org/docs/current/runtime-config-client.html), [Telegram copyMessage](https://core.telegram.org/bots/api#copymessage), [Python IP classification](https://docs.python.org/3/library/ipaddress.html).


## Release migration command

The existing Railway pre-deploy command can remain:

```bash
npm run migrate:release
```

Phase 8 extends that command to apply `003_runtime_security.sql` after the already-established download and delivery migrations, under an advisory lock and checksum ledger. It is still an explicit pre-deploy/operator action; build/start/request paths never run DDL.

`004_phase8_indexes.sql` remains optional and separate because its `CREATE INDEX CONCURRENTLY` statements must run outside a transaction and are performance-only, not a correctness prerequisite.
