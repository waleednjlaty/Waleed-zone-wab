# Waleed Zone — zero-cost cloud and download plan

**Agent D · Issue [#11](https://github.com/waleednjlaty/Waleed-zone-wab/issues/11) · branch `agent/cloud-free-tier-audit`**
**Verified: 2026-10-02.** Architecture only; no resources, billing changes, migrations, or deployments are authorized by this document.

## 1. Decision and scope

Keep the existing deployment unchanged in this phase. Separate the **application control plane** (Next.js, authentication, search, authorization, database and token operations) from **file delivery** (private object storage serving browsers directly). Do not relay APK/XAPK bytes through Next.js.

Zero-cost is conditional on the actual account being a no-payment-method Free account and usage staying within its quotas. The repository cannot establish the current Railway subscription, remaining credits, database provider, preview settings, or existing billing liability. Do not describe the running site as verified free.

For a later, separately authorized small-audience pilot, investigate Railway Free buckets first because this project's configuration already targets Railway and its current bucket pricing excludes transfer and operation charges. **This is a credit-funded allowance, not free unmetered storage:** bucket storage competes with the app for the same $1 monthly credit. If the app cannot fit that budget, stop or evaluate the Render Free fallback below; do not upgrade automatically. A Neon Free storage pilot is another cardless candidate, but its 5 GB shared monthly egress allowance is unsuitable for a public large-file catalog. Supabase Free is useful for small images, not large APKs. R2 is excluded from Stage 1 because its subscription has metered overage and a billing checkout. [R1][R2][R5][H1][N1][N2][N3][S1][S2][C1][C2]

### Five priority risks

1. **Unknown billing reality and shared credits:** repository configuration cannot prove a $0 account; always-on Next.js memory alone may exceed Railway Free's monthly credit.
2. **Binary delivery through the app:** 500 MB × 1000 downloads is 500 GB; app-host transfer billing and long-lived connections make a proxy particularly costly.
3. **Large-file origin eligibility:** Supabase Free rejects files above 50 MB; Neon has low shared egress; Railway buckets remain subject to credit/storage suspension; R2 is metered and not verified cardless.
4. **Quota and privacy bypass:** replayable signed URLs, public cache rules and unbounded event tables can defeat a cooldown or consume quotas without corresponding completed downloads.
5. **Parallel deployment and runtime health:** unnecessary previews multiply usage; the repository pins an EOL Node major and small containers need memory measurements before release.

Details and official evidence are in Sections 2–10. No mitigation is implemented in this task.

## 2. Repository audit: observed facts, not account assumptions

Audited commit: `3e16c6c69107998f7eceeb37028601ebe8aaf644`. Agent D and fetched `main` matched at audit time. No `AGENTS.md` or tracked GitHub Actions workflow was present in that snapshot. Agent A/B changes are not assumed merged.

| Area | Repository evidence | Consequence |
| --- | --- | --- |
| Framework | `package.json`: Next.js **15.5.26**, React **18.3.1** range, TypeScript, Tailwind 3, npm lockfile | Preserve the stack; this is a Node server application, not a static-only site. |
| Runtime/toolchain | `engines.node: >=20.19.0 <21`; `packageManager: npm@10.8.2` | Production Node patch version is unknown. Node 20 is now EOL; plan a separately reviewed supported-LTS update, without editing dependencies here. [J1] |
| Build/start | `npm ci`, `npm run build` → `next build`; `npm start` → `next start`; typecheck and lint scripts | No Dockerfile, Railway configuration file, Nixpacks/Railpack config, pinned `.nvmrc`, static export, or standalone output was found. Dashboard builder, commands, region and resource settings remain unknown. |
| Railway assumption | `.env.example`, `src/lib/site.ts`, README and proxy comment in `/api/visit` reference `waleed-zone.up.railway.app` | Evidence of intended Railway deployment, not proof of billing tier or live deployment health. |
| Database | `drizzle-orm`, `postgres`; `src/lib/db.ts`, `src/lib/db/schema.ts` | PostgreSQL through private `DATABASE_URL`. Neon hostname handling exists, but **does not prove Neon is the active provider**. |
| Connections | `getDb()` and `getSql()` create separate process-global clients, each `max: 1`, idle/connect timeouts 10 seconds, `prepare: false` | Up to two clients per process; aggregate across replicas/previews. External DB transfer and cold starts still matter. |
| Catalog schema | `applications`: names, descriptions, versions, text size, category, platform, developer, image URL, `shrankme_url`, `devupload_url`, counters and publication flags | Stores metadata/links; no APK binary column or separate versions table in this snapshot. Bot owns the listing schema per README. |
| Runtime DDL/state | `auth.ts`: `site_users`, `site_sessions`, `site_favorites`, `site_rate_limits`; `visit-store.ts`: `site_visits`, initialized with SQL DDL | A smoke test against production can write/create tables. Build and preview verification must use isolated test data, never production credentials. |
| Rendering | `/`, `/app/[id]`, `/category/[category]`, `/account` explicitly `force-dynamic`; navbar/auth reads cookies | Catalog requests currently incur runtime work. React `cache()` wraps queries but is not a persistent cross-request database cache. [J2] |
| Downloads | App details link to Telegram and a validated external URL | No download token endpoint, object-storage SDK/config, upload route, or binary proxy exists. Do not infer ownership/control of external files. |
| Images | `CoverImage.tsx` uses browser `<img>`, lazy loading and an error fallback; image URLs come from DB | No Next image optimizer or remote image transformation strategy is configured. External image bytes ordinarily bypass the app host. |
| Local assets | `public/waleed-zone-brand.jpg` about 24 KiB allocated; `public/wz-mark.svg` about 4 KiB allocated; local font packages | Tiny brand assets belong in Git/public. Size figures are local filesystem allocation, not exact transferred bytes. No APKs/screenshots were found in public. |
| Tracking | `VisitorTracker` posts to `/api/visit` on mount; route writes a daily HMAC visitor key; stats reads aggregate DB values | Visits, account state and rate-limit rows can grow faster than catalog metadata. |
| API cache | `next.config.js` sets `/api/*` to `no-store` and noindex | Preserve this for sensitive endpoints; a global CDN cache rule would override the intended privacy boundary. |

### Observed routes

| Routes | Current role |
| --- | --- |
| `/`, `/?q=…`, `/?category=…`, `/?browse=all`, `/?page=…` | Discovery/search/pagination; no separate `/search` route at audit time. |
| `/app/[id]`, `/category/[category]` | App/game information shares the app route; category catalog. |
| `/account`, `/login`, `/register` | Account, login and registration. |
| `/about`, `/privacy` | Public information. |
| `/api/auth/login`, `/api/auth/logout`, `/api/auth/register` | Authentication POST endpoints. |
| `/api/favorites`, `/api/visit`, `/api/stats` | Favorites, visit write, protected statistics. |
| `/ads.txt`, `/robots.txt`, `/sitemap.xml` | Text/metadata route handlers. Sitemap queries the DB; verify freshness after integration. |

No dedicated `/game`, `/download`, admin dashboard or object-storage route was present. Agent A may change this inventory; repeat the audit at integration.

## 3. Official provider limits and billing classification

All provider figures below were checked against official documentation/pricing on the verification date. **Unspecified means not established by the cited source, never unlimited.** Limits are account/project/workspace scoped as indicated; do not multiply allowances by creating accounts. Recheck before provisioning because pricing and eligibility can change.

### Hosting and database options

| Option | Classification/card | Storage and transfer | Build/runtime/requests | Sleep/expiry and decision |
| --- | --- | --- | --- | --- |
| Railway Free application | **FREE WITHOUT CARD, funded by recurring credits**; $1/month, no rollover. Initial trial is **FREE CREDITS ONLY**: $5 once, at most 30 days | 1 GB ephemeral disk, 0.5 GB volume cap; CPU/RAM/volume/egress share the credit, not separate free allowances | Free: 1 replica, up to 1 vCPU/0.5 GB RAM, 4 GB build image. Service builds themselves have no CPU/RAM/image charge. No monthly build-count entitlement established | Optional Serverless sleeps about 5–10 min after outbound activity stops; not proven enabled here. DB connections/telemetry can prevent sleep. Trial switches to Free; credit exhaustion makes availability conditional. Keep existing host only while measured budget fits. [R1][R2][R3] |
| Render Free web service + $0 Hobby workspace | **FREE WITHOUT CARD**; **PAID AFTER LIMIT if a payment method is added** | Ephemeral filesystem; no persistent disk. Workspace includes 5 GB outbound/month | 512 MB RAM; a fixed CPU share was not established by the fetched pricing text; 750 free instance-hours/workspace/month. Standard pipeline: 500 min/month; Starter builder 2 CPU/8 GB. No application request-count allowance established | Sleeps after 15 min idle, wake about 1 min. No-card bandwidth exhaustion suspends services; exhausted build quota blocks new builds. Cold SEO/robots behavior and external DB traffic suspension risk make this a fallback, not a migration instruction. [H1][H2][H3] |
| Neon Free PostgreSQL | **FREE WITHOUT CARD**; pricing says no time limit | Live official pricing/docs: 1 GB Postgres/project, 20 GB across Free projects; 5 GB public egress/project/month shared with storage/functions | 100 CU-hours/project/month; autoscale ceiling 2 CU (~8 GB RAM). 10 branches/project, 100 projects. No per-month SQL-request entitlement established | Mandatory scale-to-zero after 5 min idle. Suitable metadata candidate; no app build service implied. Do not migrate an existing DB without a bot-compatible export/import and restore plan. [N1][N2] |
| Supabase Free PostgreSQL/storage | **FREE WITHOUT CARD**; Free usage is not charged, excess may be restricted | 500 MB database/project; 1 GB object storage; 5 GB uncached + separately 5 GB cached egress/month. **These are separate pools, not interchangeable 10 GB.** | Shared CPU/500 MB RAM. Unlimited API requests as advertised is not unlimited throughput/CPU/egress. 2 active Free projects | Pauses after 1 week inactivity; no fixed trial expiry listed. Free DB can become read-only above 500 MB. Its Auth quota is not the quota for this site's existing custom SQL authentication. [S1][S3][S4][S5][S6] |
| Render Free PostgreSQL | **FREE WITHOUT CARD**, **time-limited**, not sustainable permanent DB | 1 GB database | One Free database/workspace; separate from web-service build/runtime | Expires after 30 days, deletion after a further 14-day grace period; no backups. Reject as the site's long-term DB. [H1] |

**Freshness discrepancy:** search-index snippets still showed Neon's old 0.5 GB figure. Directly fetched official pricing and plans pages agreed on 1 GB at audit time. Use those live sources, and retain a conservative **400 MB operating target** until the actual account dashboard confirms its quota. This is a proposed safety threshold, not a provider limit. [N1][N2]

Railway public ingress also has documented technical limits (10,000 connections and approximately 11,000 requests/second), not a Free-plan promise of that much usable capacity. Requests may run at most 15 min while transferring, with a 5 min no-transfer timeout; bodies must upload within 5 min. A small Node container will saturate much earlier. [R4]

### File storage/CDN shortlist

| Option | Storage / object size | Transfer / operations | Billing safety and suitability |
| --- | --- | --- | --- |
| Railway Free bucket | Up to 10 GB-month/month; storage costs $0.015/GB-month, rounded up at the final GB-month total, **deducted from the shared $1 credit** | Official billing specifies no bucket egress charge and no S3 operation charge; no distinct monthly request allotment. This is a pricing statement, not a guaranteed throughput SLA | **FREE WITHOUT CARD via credits**, only if eligible/account truly Free. Access suspends when shared credits run out. Limited Trial buckets unavailable; Trial allowance is 50 GB-month and is temporary. Strongest existing-provider candidate for a small large-file pilot; not created here. [R5] |
| Neon Free object storage | 5 GB/project; currently 5 GiB maximum object, single/multipart | Same 5 GB/project/month public transfer pool as DB/functions; plans list no per-operation charge. Do not promise a request-rate allowance | **FREE WITHOUT CARD**. Can hold a 500 MB/1 GB file but cannot support repeated public large downloads. Region availability must match the chosen project. Use private buckets/presigned delivery only after validation. [N1][N2][N3][N4] |
| Supabase Free storage | 1 GB total; **50 MB maximum individual file** on Free, including bucket/global limits | 5 GB uncached and 5 GB cached separate egress pools shared by eligible services; unlimited advertised API requests do not remove file/transfer limits | **FREE WITHOUT CARD**. Good for a modest icon/screenshot set or very small test ZIP/APK; rejects 100 MB, 500 MB and 1 GB files. Resumable uploads do not bypass the Free file-size cap. [S1][S2][S5] |
| Cloudflare R2 Standard | Free allowance: 10 GB-month/month | 1M Class A + 10M Class B/month; direct R2 egress has no transfer fee. Above allowance: $0.015/GB-month, $4.50/M A, $0.36/M B; billed-unit rounding applies | **PAID AFTER LIMIT / billing-method subscription**. Treat as **FREE BUT REQUIRES CARD or accepted payment method**, not a verified cardless option: official onboarding requires subscription checkout; billing docs support cards/wallets. Excluded from Stage 1. Stage 2 candidate only with explicit billing choice. [C1][C2][C3] |
| `public/` / app container | Repository-deployed brand assets only; host disk/build limits above | Asset traffic consumes host transfer allowance; no independent free storage/CDN entitlement | No additional subscription, but poor fit for a mutable binary catalog. Never put APK/XAPK archives in Git or the deploy image. |

**No separate CDN is required for the initial controlled pilot.** Browser downloads go directly to storage. Do not assume object storage includes a global CDN, or that a generic free CDN permits arbitrary large-file delivery. Railway buckets are private and support signed URLs; confirm their published object-size/endpoint behavior before admitting a 2 GB file. The inspected Railway pages did not establish a per-object maximum; that remains an integration gate. [R6][R7]

R2's development `r2.dev` endpoint is rate-limited and not intended for production. R2 S3 presigned URLs use the S3 endpoint, not a custom-domain CDN path; a later CDN design must preserve authorization and verify its own limits/costs. Do not introduce it in the zero-cost stage. [C4][C5]

## 4. Direct-download bandwidth: arithmetic

These are estimates, **not provider allowances**. Decimal units: 1 GB = 1000 MB, 1 TB = 1000 GB; 30-day month; each row assumes every download completes once.

`daily GB = downloads/day × file MB ÷ 1000`
`monthly GB = daily GB × 30`

| Downloads/day | File size | Daily transfer | Monthly transfer |
| ---: | ---: | ---: | ---: |
| 100 | 50 MB | 5 GB | 150 GB |
| 100 | 100 MB | 10 GB | 300 GB |
| 100 | 500 MB | 50 GB | 1,500 GB (1.5 TB) |
| 100 | 1 GB | 100 GB | 3,000 GB (3 TB) |
| 500 | 50 MB | 25 GB | 750 GB |
| 500 | 100 MB | 50 GB | 1,500 GB (1.5 TB) |
| 500 | 500 MB | 250 GB | 7,500 GB (7.5 TB) |
| 500 | 1 GB | 500 GB | 15,000 GB (15 TB) |
| 1000 | 50 MB | 50 GB | 1,500 GB (1.5 TB) |
| 1000 | 100 MB | 100 GB | 3,000 GB (3 TB) |
| 1000 | 500 MB | 500 GB | 15,000 GB (15 TB) |
| 1000 | 1 GB | 1000 GB (1 TB) | 30,000 GB (30 TB) |

**500 MB × 1000 downloads = 500,000 MB ≈ 500 GB.** If that happens daily, about 15 TB/month. A binary-size label of 500 MiB would produce about 524 GB for 1000 copies, so counters should store exact bytes.

Retries, replays, multiple ranges, bots, screenshots and protocol overhead increase consumption. CDN hits still transfer bytes to browsers and can count toward a provider's cached-transfer quota. Storage capacity is a different measure: one 500 MB object downloaded 1000 times can occupy only 500 MB while transmitting 500 GB.

For a 5 GB/month transfer allowance, ideal ceilings before any other traffic are 100 downloads of 50 MB, 50 of 100 MB, 10 of 500 MB or 5 of 1 GB **per month**, not per day. Supabase Free also independently rejects those larger objects. Neon shares that allowance with database traffic. Therefore neither is a realistic high-download free origin. [N2][S2][S5]

Railway bucket delivery and R2 direct delivery do not have the same metered-egress model as those examples. Their official pricing excludes direct transfer fees, but storage/account suspension, eligibility, abuse policy, request/throughput behavior and availability remain constraints. Do not call the whole architecture unlimited or promise 15 TB/month production reliability. [R5][C1]

## 5. Railway reality and budget model

The Free plan and a Trial are different. Hobby is a paid minimum of $5/month with included usage, not a free tier. Compute pricing is $10/GB RAM-month, $20/vCPU-month, service egress $0.05/GB and volume storage $0.15/GB-month. No account plan was read or changed. [R1][R2]

**Illustrative arithmetic using those rates**, not measurements:

- 0.1 GB RAM continuously for a month costs about $1 in RAM alone; 0.2 GB costs $2. CPU, DB service, volumes and service egress are additional. The Free 0.5 GB resource ceiling is not a free always-on allocation.
- 500 GB relayed through the app costs about $25 in service egress alone. Repeated daily for 30 days costs about $750 in egress alone. Streaming avoids full-file buffering, but not transfer fees, open sockets or runtime pressure.
- 10 GB stored for a full month in a bucket costs about $0.15 from the same $1 Free credit, leaving at most $0.85 for other usage. A small free download origin can still become unavailable when the Next.js app consumes that shared balance. [R5]

Do not conflate Railway **service egress** with **bucket egress**. Uploading files from the app container to a bucket uses public-network service egress; future owner uploads should go directly to storage using narrowly authorized upload credentials/URLs. [R5]

Railway hard usage limits stop workloads; alerts alone do not. On paid accounts, a hard limit does not cancel the subscription fee, and suspended bucket data can continue accruing storage charges. A budget switch is not permission to add billing. For strict zero-cost, retain a verified Free account without payment/upgrade, use application quotas earlier than provider exhaustion, and accept downtime. Do not assume a $0 hard-limit setting is supported. [R8][R5]

## 6. Responsibility split and storage design

| Application server | Storage endpoint/browser |
| --- | --- |
| Render Next.js pages/API; authenticate; check publication, owner permissions and version availability | Serve file bytes, `HEAD`, content length, media type, range/resume where supported |
| Search DB metadata; validate request bodies; enforce 15–20 second cooldown with server time | Store immutable APK/XAPK/ZIP objects and resized images |
| Atomically reserve quota and claim/redeem tokens; generate narrowly scoped signed GET URLs | Browser follows approved short-lived URL directly; no file buffering in Node |
| Return small JSON/redirect with `no-store`; record authorization/issuance outcomes | Owner uploads directly; validate completion/size/hash before marking a version available |

Future metadata should identify provider, bucket, immutable object key, version, exact bytes, SHA-256, media type and availability. Keep URLs generated at request time; do not store an expiring signed URL as the permanent asset locator. Filename sanitization and `Content-Disposition: attachment` should be validated per provider. Keep storage private for controlled downloads; public URLs bypass the cooldown/token boundary.

A signed URL usually remains usable until expiry and may be shared/replayed. A one-use application token does **not** make the resulting storage URL one-use. A 20-second cooldown alone permits thousands of requests per person/day and is not a quota. Do not promise exact per-download bytes or hard global transfer control with a replayable URL; reconcile storage telemetry and stop issuance early with generous headroom.

For a quota-limited pilot, reserve the entire file size before issuing a URL, use an atomic shared DB counter, bound concurrent outstanding authorizations and token lifetime, and conservatively retain reservations until reconciliation. **Disallow the pilot if provider/account restrictions cannot safely contain replays.** Provider hard suspension is the last boundary. Exact byte enforcement through an edge gateway is a Stage 2 design decision with its own runtime/cost analysis.

### Database capacity and retention

Metadata is relatively small. As a planning example, 10,000 catalog/version records averaging 5 KB are about 50 MB before indexes/row overhead; this is not a measurement. Users/password hashes/session rows are also modest initially. Visits, download-event logs, abandoned sessions and rate-limit identities can dominate over time.

Keep APK/XAPK/ZIP bytes, screenshots, base64 images and full HTTP logs **outside PostgreSQL**. Store object references and compact counters. Preserve existing bot identifiers/schema compatibility. Proposed retention: expire consumed/expired token records promptly, remove expired sessions, retain detailed operational events for 7 days and daily aggregates for 30 days, subject to audit/privacy needs. Those are project policies, not provider limits.

Measure `pg_database_size(current_database())` and largest tables/indexes read-only before deciding whether Free is sufficient. Target below 70% of the confirmed DB quota; reserve remaining space for index builds, auth and cleanup. Back up metadata securely using existing free facilities and test restoration before any move. Never treat Free restore windows as a full backup strategy.

## 7. Initial image, cache and ephemeral-file policy

**Images:** retain the logo and fixed UI assets in `public/`. Keep DB URL/object-key references for changing app icons, covers and screenshots; do not put every catalog image into the repo. Resize once before publishing, generate WebP/AVIF plus fallback if needed, and store actual display sizes. Proposed pilot targets: 100 KB/icon and 300 KB/screenshot, with a capped screenshot count. Prefer controlled storage over arbitrary external image hosts; existing external URLs can remain initially with current fallback behavior, without assuming free durable hotlink rights. Do not enable paid image transformations. Supabase Free transformations are not included. [S1]

| Surface | Proposed caching policy at later integration |
| --- | --- |
| Immutable JS/CSS/fonts and fingerprinted image objects | Long browser cache; `public, max-age=31536000, immutable` only when URL changes with content. Fixed `/public` names need versioning before immutable caching. |
| About/privacy and other truly public content | Static rendering where possible after verifying layout/cookie dependencies. |
| Catalog/categories/app metadata | Consider bounded server data caching/ISR for public-only data; proposal: 60-second refresh plus explicit publication invalidation. Never cache personalized favorites inside a shared full-page result. |
| Search | Cache normalized, bounded public queries only; cap cardinality and TTL so random queries cannot fill storage. Review with Agent A. |
| Sitemap/robots | Explicit bounded regeneration and publication invalidation; avoid caching a DB-failure empty sitemap for a long interval. |
| Auth/account/favorites/stats/cooldown/token/upload authorization | `private, no-store`; no shared CDN caching, including errors/redirects carrying sensitive values. |

These are future recommendations, not a claim that ISR is enabled now. React `cache()` deduplicates work within a server render/request context; persistent Next.js data caching requires deliberate implementation. Self-hosted ISR/data caches use memory/disk and can differ across replicas, so use small budgets and do not rely on ephemeral cache persistence. [J2][J3]

Containers are ephemeral: never keep persistent APKs, SQLite account state, tokens or logs on app local disk. Railway Free ephemeral storage is 1 GB and exceeding it can cause redeployment; Render loses runtime files on sleep/restart/redeploy. Temporary files must have strict size/lifetime limits and cleanup in failure paths. A 2 GB game is inappropriate on that Railway disk even as a temporary full download. [R9][H1]

## 8. Environment variables and secrets

| Observed variable | Classification/rule |
| --- | --- |
| `DATABASE_URL` | Server-only private credential; least privilege and encrypted connections. Do not print it or infer provider from a production secret in a report. |
| `VISIT_KEY_SALT`, `WEBSITE_STATS_TOKEN` | Independent server-only random secrets; analytics/statistics access. Existing visit salt falls back to DB URL if absent: configure independent values at integration, do not propagate that coupling into downloads. |
| `NEXT_PUBLIC_SITE_URL` | Public canonical origin; HTTPS and exact production origin matter for same-origin checks. Embedded at build; not a secret. |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Public verification value used in layout; currently missing from example file. |
| `ADSENSE_PUBLISHER_ID`, `ADSENSE_CONTENT_REVIEWED`, `ADSENSE_ENABLED` | Existing advertising gates; publisher ID is public when rendered. Leave them unchanged/off for this phase. |
| `NODE_ENV` | Runtime behavior selector, not a secret. |
| Future `DOWNLOAD_TOKEN_SIGNING_SECRET`, storage access/secret keys, endpoint/bucket, quota settings | Proposed names only, not currently implemented. Signing/storage credentials must be server-only, independent of session/analytics secrets and scoped to the minimum bucket/actions. |

Never put database URLs, signing keys, storage secrets or session material under `NEXT_PUBLIC_*`, in browser bundles, Git, PR bodies or logs. Preview builds must not receive production write credentials. Issue signed URLs only after server validation; redact their query strings everywhere. Rotate leaked credentials and signing keys through a documented integration process.

## 9. CI/build policy for parallel agents

No workflow was tracked in the audited snapshot. Repository hosting is public, but external provider previews/autodeploy settings are unknown and cannot be proven disabled from Git. Pushing this documentation branch is not an instruction to provision a preview.

| Branch/agent | Required verification | Cloud deployment |
| --- | --- | --- |
| A — Phase 2 Core | Typecheck/lint/build and relevant security/search/API tests using isolated test data | No automatic branch deployment; one controlled integrated preview only if already available within confirmed free quotas. |
| B — `agent/loading-ux-system` | Typecheck/lint/build plus loading/visual/accessibility review | Same policy; do not allocate a separate always-running preview by default. |
| C — `agent/phase3-download-spec` | Markdown, contracts, threat model and references review | **Documentation only: no application build or deployment.** |
| D — `agent/cloud-free-tier-audit` | Markdown, official-source/units arithmetic, one-file diff and scope review | **Documentation only: no application build or deployment.** |
| Integrated main, after A/B review/merge by owner | One full build and isolated smoke verification; reassess changed routes/env and DB behavior | Only a separately authorized release after checking plan/remaining quota; no release from this PR. |

Future CI should filter docs-only changes out of expensive application builds/deploy hooks, cancel superseded jobs per branch, use a standard Linux runner, and retain minimal artifacts for a short period. Railway service builds have no direct build resource charge, but preview runtimes/databases and build-time calls still consume resources; Free builds can be deprioritized. Render includes 500 pipeline min/month, so 4 branches × 10 builds × an illustrative 5 min = 200 min before retries. No preview for C/D is justified. [R1][R10][H3]

Standard GitHub-hosted Actions runners are free for this public repository. Larger runners are charged even for public repositories. GitHub Free private-repo comparison: 2,000 min/month, 500 MB shared artifact storage and 10 GB/repository cache; without a payment method quota exhaustion blocks usage. Keep paid runner/budget expansion disabled; do not use CI artifacts as a binary download CDN. [G1]

Before a future release: review A/B integration, validate secrets/origin, inspect account billing and preview settings without enabling services, measure memory/DB/credit balance, test auth/search/loading with isolated data, then deploy a single approved runtime branch. Documentation merges should be excluded from autodeploy via a later approved configuration change; this task does not change those settings.

## 10. Logging, monitoring and quota fail-safe

Use provider-native dashboards and existing application signals first; add no paid monitoring suite. Railway Free retains logs 3 days (Trial 7), with a platform ceiling of 500 lines/sec/replica; neither is a target for application logging volume. Neon Free monitoring retention is 1 day. [R11][N2]

Proposed structured events: route template, request ID, status, elapsed time, app/version ID, error category and approximate bytes reserved. Do not log passwords, cookies, authorization headers, session hashes/secrets, signing keys, full DB URLs, signed file URLs, raw query strings, or full IP/user-agent data without need. Use a rotating keyed digest when abuse correlation is required, aggregate 429s, sample routine successes, and bound error stacks. Keep detailed events short-lived rather than writing one permanent DB row per range request.

| Signal | Free-first source | Action |
| --- | --- | --- |
| Credit/resource usage, CPU/RAM, app egress | Railway usage/resource dashboard and native logs; Render usage/metrics if evaluated | Compare daily projection with remaining monthly budget; stop optional writes/issuance early. [R8][H1][H4] |
| Bucket bytes/storage and provider requests | Provider storage dashboard/available native logs; daily object inventory, bounded polling | Count retained versions, screenshots and incomplete multipart uploads; reconcile quota reservations. No high-frequency billing-API polling. |
| DB bytes, connections, compute and egress | DB native dashboard plus read-only size queries | Detect growth and compute wake time; schedule bounded cleanup only after approval of integration. |
| 5xx/429, cooldown rejects, invalid/expired tokens | Aggregate application counters with small structured error samples | Separate abuse, exhausted quota and DB outage; include `Retry-After` for bounded retries. |
| Failed downloads | Storage response/logs where available plus optional browser report | Separate URL issuance from actual transfer and completion. Clicking a link is not proof of successful download; do not fabricate success statistics. |

Use native quota emails where provided. Proposed warning levels: 50%, 70% and 85% of **confirmed** quota; disable new upload/download authorizations at 85% or sooner if outstanding reservations can exhaust the remainder. These thresholds are project policy, not guaranteed provider alerts. Manual daily checks are enough for a tiny pilot; no always-on ping loop that prevents sleeping to make uptime look better.

### Proposed safeguards (not implemented)

1. Default direct downloads disabled until a private origin and quota boundary pass validation. Provider-specific file-size caps; start with a very small catalog and a conservative **2 GB total retained-object budget** on a Railway pilot, below its 10 GB-month limit. Account for old versions and images separately.
2. Server-enforced 15–20 second cooldown, per-account and per-abuse-identity rate limits, global concurrency bound, daily authorization count and a global byte reservation budget. Reject before generating signed URLs; transactional counters shared across replicas, not in-memory only.
3. Small-file egress-limited pilot: proposed combined transfer budget at most 2 GB/month out of a confirmed 5 GB pool, with room for DB/images/replays. Disable if shared telemetry or hard restrictions cannot enforce acceptable risk. Large files stay unavailable on that pilot.
4. Provider/account Free plan must remain without billing additions, auto-upgrade or paid features. Alerts never authorize upgrades. On credit exhaustion, degrade to available public cached catalog content or a truthful temporary-unavailable state; never pretend a file is downloadable.
5. On DB/quota/storage uncertainty, fail closed for authorization/uploads. Use 429 for bounded abuse/cooldown; 503 with suitable retry guidance for unavailable origin/global quota. Do not send users to Telegram as the new direct-download success path. Avoid a permanent error cached by a CDN.
6. Stop issuing URLs at the soft boundary; already issued URLs may remain valid and active transfers may continue. For an emergency, use provider revocation/object access controls, respecting their semantics. A cached private file cannot be made private by toggling only the app flag.

If the application host itself is suspended, its own graceful error page cannot run. An independent static status page could be planned later, but do not provision one here or promise seamless failover. Resume service only when quota resets or the owner explicitly chooses a paid stage. Preserve metadata backups; do not delete accounts/files automatically to conceal quota problems.

## 11. Component cost/upgrade table

| Component | Current role | Free option | Free limit / operating target | Main risk | When upgrade becomes necessary |
| --- | --- | --- | --- | --- | --- |
| App hosting | Dynamic Next.js/API/auth | Existing Railway Free if confirmed; Render Free fallback only after a later decision | Railway shared $1/month, 0.5 GB RAM; Render 750 h, 5 GB outbound, 500 pipeline min [R1][R2][H1][H2] | Always-on RAM/CPU exhaust credits; cold starts and preview replicas | Measured usage cannot fit without unacceptable downtime; owner chooses payment. |
| Database | Catalog and custom SQL state | Retain confirmed current Free DB; Neon/Supabase candidates | Neon 1 GB and 100 CU-h/project; Supabase 500 MB [N1][N2][S1] | Event growth, cold starts, compute/egress limits, unknown active provider | Capacity/connection/restore/availability needs exceed the confirmed free plan. |
| Images | DB URLs plus tiny public brand assets | Public for fixed assets; compressed storage-backed images | Share chosen origin's storage/egress; Supabase 1 GB storage/50 MB object [S1][S2] | Hotlink loss, full-resolution screenshots and transformations | Image traffic or catalog grows beyond the reserved quota. |
| APK/XAPK/ZIP storage | Currently external/bot links | Conditional Railway Free private bucket pilot; Neon only tiny test pilot | Railway 10 GB-month sharing $1; proposed 2 GB retained target. Neon 5 GB objects/5 GB shared egress [R5][N2][N3] | Old versions, shared-credit suspension, link replays | Storage/availability exceeds pilot; do not proxy through app as fallback. |
| CDN/file delivery | No configured object origin/CDN | Direct signed storage delivery; no separate CDN in Stage 1 | No invented CDN allowance; Railway direct bucket pricing differs from app egress [R5][R6] | Public URLs bypass auth; cache leakage; throughput not guaranteed | A separately budgeted authenticated edge/cache becomes justified. |
| Logging | Native stdout/events | Native logs, compact aggregates | Railway Free 3-day retention; proposed 7-day compact event retention [R11] | Tokens/IP leakage or unbounded event rows | Longer investigation/audit needs and owner-approved budget. |
| Monitoring | Existing stats API, native dashboards | Native dashboards/read-only queries | Neon Free metrics 1-day history; no new paid suite [N2] | No confirmation that an issued URL completed transfer | Sustained traffic needs reliable longer history/automated response. |
| Build/CI | npm scripts, no tracked workflow in snapshot | Standard public GitHub runner; build A/B only | Standard public runner minutes free; paid larger runners excluded [G1] | Blind previews, retries and artifacts | More build capacity is deliberately needed after eliminating duplication. |

## 12. Integration note for Agent C

Read [Issue #10](https://github.com/waleednjlaty/Waleed-zone-wab/issues/10) and its [zero-cost constraint comment](https://github.com/waleednjlaty/Waleed-zone-wab/issues/10#issuecomment-5945729553). The fetched C branch at audited commit did **not yet contain** `docs/DOWNLOAD_SYSTEM_SPEC.md`; this is compatibility review of the issue requirements, not a claim to have reviewed an unpublished spec. Do not edit C's file.

At integration, C's design should:

- Select private object delivery after server verification/cooldown and return a temporary storage URL; no binary Next.js proxy. Railway storage is a conditional candidate, not an already configured resource.
- Put quota **reservation before token/URL issuance**, share limits transactionally, and specify monthly/daily quota exhaustion independently of 429 cooldown.
- Make storage capabilities explicit: byte/range support, URL lifetime, replay behavior, upload/object-size bound, hash/version availability and verified account plan. Validate resume after expiry; issuing a fresh URL repeats authorization and quota accounting.
- Distinguish single-use application token from replayable signed storage URL; do not claim complete hotlink resistance with CORS or a referer check. Do not count URL generation as download completion.
- Support `downloads_disabled`/`origin_unavailable` without a Telegram redirect, paid fallback or automatic provisioning. 100–1000 downloads/day can be incompatible with an egress-limited Free origin even if the code is correct.
- Exclude mandatory R2/paid CDN/Redis infrastructure in Stage 1. Supabase Free cannot be the 500 MB/1 GB origin. If Neon is used, reserve its shared 5 GB egress for DB and file traffic, not files alone.
- Treat Railway bucket storage/compute as shared-credit dependencies. Evaluate pricing separately from throughput/SLA; explicitly test signed delivery and large-object eligibility before launch.

## 13. Scaling path and recommended architecture

### Stage 1 — zero-cost / small audience

**Now:** keep the existing Railway configuration and database untouched, ship this document only, and leave direct-download infrastructure unimplemented. Verify billing reality before any future release. Public catalog caching, existing browser image delivery, bounded metadata and no C/D deployments keep the control plane small.

**Later authorized pilot:** one Next.js runtime, existing confirmed no-cost PostgreSQL, fixed assets in `public/`, private immutable objects, and server-generated signed storage GETs. Prefer an evaluation of Railway Free buckets because current official pricing makes direct file delivery materially cheaper than app-server delivery and avoids introducing a new billing provider. Admit only a small retained catalog, use independent upload authorization and quota reservations, and fail closed before credit exhaustion. An existing app consuming more than the shared allowance makes this combination nonviable at $0 even with free bucket transfer.

If needed, evaluate a single Render Free Node service with the retained external Free PostgreSQL and a separately confirmed eligible Railway Free bucket; this separates app operation from the bucket's credit burn, but introduces cold-start/SEO and external-DB limitations. It is a **future fallback proposal**, not an executed migration. Neon Free object storage supports a tiny signed-download demonstration; its low shared egress is not an alternative public large-file service. If no verified eligible safe origin is available, retain the catalog and disable new direct-download capability. That is the honest zero-cost fallback.

This avoids enterprise infrastructure: no mandatory queue, cache cluster, multi-region service, separate auth provider, edge gateway or monitoring subscription. It preserves the current Next.js/SQL boundaries and lets Agent C later implement authorization without owning the byte stream.

### Stage 2 — traffic grows and the owner chooses to pay

Measure retention, actual transfer, replay/abuse, app memory and DB growth first. Owner then selects a bounded paid app budget, DB capacity/backup strategy and storage origin. Compare current Railway bucket terms against R2 Standard and recheck actual regional throughput and authorization needs; R2's no-egress-fee model can be useful, but its storage/operations still bill and activation is not cardless. Do not lock into it solely for popularity. [R5][C1][C2]

Add a CDN/edge authorization layer only if measured performance or abuse requires it, with a separate budget and validated cache privacy. Migrate metadata/object keys through a provider adapter, test integrity/Range/resume and rollback, keep a quota kill switch, and require explicit owner approval for subscription, payment method, resource creation, migration and deployment. No Stage 2 action occurs in this task.

## 14. Official sources

All links below are official, accessed 2026-10-02. Provider figures above reference these identifiers. Operational targets and bandwidth arithmetic are explicitly project estimates.

- [R1 — Railway plans, resource pricing and free build accounting](https://docs.railway.com/pricing/plans)
- [R2 — Railway Free/Trial, duration and credits](https://docs.railway.com/pricing/free-trial); [official pricing/card requirement](https://railway.com/pricing)
- [R3 — Railway Serverless sleep behavior](https://docs.railway.com/deployments/serverless)
- [R4 — Railway public-network specifications](https://docs.railway.com/networking/public-networking/specs-and-limits)
- [R5 — Railway bucket billing, Free storage allowance, suspension and service-egress distinction](https://docs.railway.com/storage-buckets/billing)
- [R6 — Railway bucket delivery](https://docs.railway.com/storage-buckets/uploading-serving)
- [R7 — Railway bucket architecture](https://docs.railway.com/storage-buckets)
- [R8 — Railway cost controls](https://docs.railway.com/pricing/cost-control)
- [R9 — Railway services/ephemeral storage](https://docs.railway.com/services)
- [R10 — Railway deployment reference/limited access](https://docs.railway.com/deployments/reference)
- [R11 — Railway native logs and retention](https://docs.railway.com/observability/logs)
- [H1 — Render Free behavior, suspension, filesystem and DB expiry](https://render.com/docs/free)
- [H2 — Render official workspace/compute pricing](https://render.com/pricing)
- [H3 — Render pipeline minutes and builder resources](https://render.com/docs/build-pipeline)
- [H4 — Render native service metrics](https://render.com/docs/service-metrics)
- [N1 — Neon live official pricing/no-card Free](https://neon.com/pricing)
- [N2 — Neon live plan limits, compute, storage, egress and metrics](https://neon.com/docs/introduction/plans)
- [N3 — Neon object storage/object-size/region limits](https://neon.com/docs/storage/overview)
- [N4 — Neon storage authentication/presigning](https://neon.com/docs/storage/authentication); [object operations](https://neon.com/docs/storage/objects)
- [S1 — Supabase pricing](https://supabase.com/pricing)
- [S2 — Supabase Free file-size limit](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [S3 — Supabase Free cost-control behavior](https://supabase.com/docs/guides/platform/cost-control)
- [S4 — Supabase database-size/read-only behavior](https://supabase.com/docs/guides/platform/database-size)
- [S5 — Supabase cached/uncached egress accounting](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [S6 — Supabase official no-card Free confirmation](https://supabase.com/blog/observability-for-every-supabase-project-with-grafana-cloud)
- [C1 — Cloudflare R2 Standard pricing/free allowances](https://developers.cloudflare.com/r2/pricing/)
- [C2 — R2 subscription checkout/billing requirement](https://developers.cloudflare.com/r2/get-started/)
- [C3 — Cloudflare billing/payment setup](https://developers.cloudflare.com/billing/get-started/create-billing-profile/)
- [C4 — R2 public-development endpoint/cache limitations](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [C5 — R2 presigned URL endpoint constraints](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [G1 — GitHub Actions billing, allowances and no-payment blocking](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [J1 — Node.js official release lifecycle](https://nodejs.org/en/about/previous-releases)
- [J2 — React server cache semantics](https://react.dev/reference/react/cache)
- [J3 — Next.js self-hosting and caching](https://nextjs.org/docs/app/guides/self-hosting)

<!-- Reference definitions make inline source IDs clickable on GitHub. -->

[R1]: https://docs.railway.com/pricing/plans
[R2]: https://docs.railway.com/pricing/free-trial
[R3]: https://docs.railway.com/deployments/serverless
[R4]: https://docs.railway.com/networking/public-networking/specs-and-limits
[R5]: https://docs.railway.com/storage-buckets/billing
[R6]: https://docs.railway.com/storage-buckets/uploading-serving
[R7]: https://docs.railway.com/storage-buckets
[R8]: https://docs.railway.com/pricing/cost-control
[R9]: https://docs.railway.com/services
[R10]: https://docs.railway.com/deployments/reference
[R11]: https://docs.railway.com/observability/logs
[H1]: https://render.com/docs/free
[H2]: https://render.com/pricing
[H3]: https://render.com/docs/build-pipeline
[H4]: https://render.com/docs/service-metrics
[N1]: https://neon.com/pricing
[N2]: https://neon.com/docs/introduction/plans
[N3]: https://neon.com/docs/storage/overview
[N4]: https://neon.com/docs/storage/authentication
[S1]: https://supabase.com/pricing
[S2]: https://supabase.com/docs/guides/storage/uploads/file-limits
[S3]: https://supabase.com/docs/guides/platform/cost-control
[S4]: https://supabase.com/docs/guides/platform/database-size
[S5]: https://supabase.com/docs/guides/platform/manage-your-usage/egress
[S6]: https://supabase.com/blog/observability-for-every-supabase-project-with-grafana-cloud
[C1]: https://developers.cloudflare.com/r2/pricing/
[C2]: https://developers.cloudflare.com/r2/get-started/
[C3]: https://developers.cloudflare.com/billing/get-started/create-billing-profile/
[C4]: https://developers.cloudflare.com/r2/buckets/public-buckets/
[C5]: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
[G1]: https://docs.github.com/en/billing/concepts/product-billing/github-actions
[J1]: https://nodejs.org/en/about/previous-releases
[J2]: https://react.dev/reference/react/cache
[J3]: https://nextjs.org/docs/app/guides/self-hosting

## 15. Audit completion

Only `docs/CLOUD_FREE_TIER_PLAN.md` is changed. No runtime code, database, dependency, cloud setting, storage/CDN resource, billing method, preview or deployment was changed. No merge is performed. Integration still requires the actual account/quota snapshot and review of Agent A/B/C's final commits.
