# Phase 8 performance review

No redesign, catalog cache, paid CDN/service or deployment. Figures below are local synthetic observations, not production Core Web Vitals or latency promises. Both original main and Phase 8 were built using Node 20.19.5 and the same installed dependency tree.

## Before / after

| Path / work | Before | After |
|---|---|---|
| Apps/Games landing | Hydrated all public sitemap summaries, classified/paginated in JS | Same category classification in SQL; count + only 24 summaries for the requested page. In the fixture, 1,000 → 24 transferred rows. Metadata and page share per-request React cache. |
| Stats | Four separate application/visit aggregates | One application aggregate for counts/views/downloads plus visits: two scans. |
| Session lookup | Repeated lookup / lazy schema DDL checks | Per-request React cache and no redundant schema check in current-user lookup; explicit migration rather than DDL in requests. |
| Delivery decision | Separate reads could mix revision/publication/source versions | One joined statement plus read-only schema check; no N+1 per source. |
| Countdown | Client timer every 100ms | Every 250ms, small isolated component, integer updates bail out; server enforces unchanged exact 20-second boundary. |
| Key image loading | All catalog/detail covers lazy | First primary card and detail icon eager/high priority, fixed dimensions retained. Other covers remain lazy. |
| Search input | Normalization received arbitrarily long raw input | Bound before normalization, 100-character query, existing bilingual/alias/fuzzy ranking retained. |
| Public newest-first query, 100k-row fixture | Sequential scan + top-N sort, 736 shared blocks, 5.826ms | Public partial index used, 20 shared blocks, 0.035ms. |
| Exact category newest-first fixture | Sequential scan + sort, 4.684ms | Category/public partial index-only scan used, 0.039ms (24 heap fetches before vacuum). |

The EXPLAIN fixture is native PostgreSQL 16 with 100,000 applications, 1% public and selective categories. It measures one warm local run; timings are not confidence intervals or a production benchmark. Both full JSON plans are stored in [phase8-performance-results.json](phase8-performance-results.json). Optional migration `004_phase8_indexes.sql` uses the earlier index names to avoid duplicates and must run CONCURRENTLY outside a transaction; no production indexes were created. On a small catalog the planner may prefer a scan. No speculative trigram/full-text/favorites/source index was added: existing PK/composite provider uniqueness support those accesses, session-user and rate-reset indexes support demonstrated lifecycle/cleanup operations.

## Bundle / rendering review

| Next build report | Original main | Phase 8 |
|---|---|---|
| Shared first-load JS | 103kB | 103kB |
| Home first-load JS | 116kB | 116kB |
| Apps/Games landing first-load JS | 106kB | 106kB |
| Detail first-load JS | 110kB | 110kB |
| Download first-load JS | 116kB | 116kB |
| Admin first-load JS | 121kB | 121kB |
| Login first-load JS | 108kB | 107kB |
| Middleware | 34.4kB | 35.0kB |

Rounded Next report sizes include shared chunks; no meaningful overall bundle reduction is claimed. Security nonce handling remains server-only. No new application runtime dependency or unnecessary client component was added. The small middleware increase buys response CSP; framework version is unchanged. Server components continue to render catalog/details; admin/search/auth/countdown interactivity remains isolated. React review checked hooks, stable state updates, rendering boundaries and image priorities without changing design.

LCP: primary cover priority reduces an avoidable image delay; fonts already come from local bundled font packages rather than a blocking external fetch. CLS: fixed cover frames/aspect ratios and skeleton dimensions retained, browser horizontal overflow checked at 360/768/1440. INP: countdown work remains small, input normalization bounded, existing search debounce and stale-response handling retained. These are mitigations/review observations. **No field LCP/CLS/INP percentile, Lighthouse score or before/after lab CWV measurement was collected**, so the PR does not claim a numerical CWV improvement.

## Freshness, caching and remaining bottlenecks

Public queries retain React per-request memoization only. No cross-request TTL/tag cache was introduced; bot commits appear on the next HTTP request, verified through native shared DB fixtures and search/details. Admin/auth/private responses/download grants remain no-store. Authenticated layout cookies plus nonce CSP require dynamic pages; removing force-dynamic without a separate static/public boundary would risk sessions or nonce behavior and is outside this phase. This preserves existing catalog freshness rather than adding invalidation infrastructure.

Search ranking on synthetic Arabic `واتساب`, alias `WhatsApp` and typo `whatsap` documents measured 4.15–7.54ms at 100 records, 27.11–33.29ms at 1,000, and 52.98–59.22ms at 2,000 in this run. Final search normalization/ranking quality fixtures pass. Existing provider bounds the small catalog at 2,001 records and large-catalog candidates at 500, using at most 12 bounded terms and parameterized LIKE predicates. Large-catalog normalized SQL expressions can still scan many rows; statement timeout and quota mitigate work, not eliminate it. A future search index needs a measured production query/workload and must preserve bilingual quality.

Count queries, sitemap enumeration, offset pagination, normalized large-catalog search and website pool max=1 remain potential bottlenecks. Public landing count/page are separate read-committed statements; a concurrent publication can make a transient count/page mismatch, corrected on the next fresh request. A shared limiter adds DB writes/hot keys; wider pooling/Redis is not added without load evidence. Bot provider operations inside transactions can hold a connection longer than desired. These constraints are documented, not hidden by caching or reduced security checks.

External raw HTTPS image bytes/compression depend on ImgBB/other approved catalog URLs. The server does not proxy untrusted image hosts through Next image optimization, avoiding a new SSRF boundary. No real external image/provider traffic was needed for local security browser tests; actual remote image LCP remains an operator measurement.

## Local validation / repeatability

Native EXPLAIN + category-classification parity and search fixtures:

```sh
# EMPTY disposable literal-loopback DB named wz_phase8_perf_<suffix> only.
WZ_PERF_TEST_DATABASE_URL=postgres://test_user@127.0.0.1:5432/wz_phase8_perf_review \
 node scripts/phase8-performance.mjs
```

The script refuses other hosts/non-empty catalogs. It applies optional indexes solely to the fixture and writes the JSON report. Existing HTTP/browser suites verify Home, Apps, Games, bilingual Search, Details, native Download, Login, Account and Owner Admin at 360/768/1440, including reduced motion, overflow, console/runtime errors, source freshness and stale revisions. The native Telegram browser intercepts the final exact-message request locally; no uploaded file/provider traffic is sent. Review [PHASE8_SECURITY_REVIEW.md](PHASE8_SECURITY_REVIEW.md) for exact test counts, accepted availability limits and manual release checks.
