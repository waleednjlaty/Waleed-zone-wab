# Branded SEO and indexing review — Agent I

Issue: https://github.com/waleednjlaty/Waleed-zone-wab/issues/20  
Branch: `agent/seo-brand-indexing`  
Base: integrated Phase 2 main at `7264a93`  
Review date: 2026-10-02

## Problem and findings

The owner reported that Google sometimes selects Privacy for branded queries. The repository's homepage had a generic title and H1; navigation linked Apps/Games to homepage fragments; Privacy was indexable and inherited homepage social metadata. These are code-level findings, not proof of Google's ranking decision. Search Console's indexed HTML, selected canonical and query history were not accessed.

The update reinforces one homepage identity for Waleed Zone / وليد زون and creates useful, crawlable catalog destinations for تطبيقات وليد زون / ألعاب وليد زون. It does not promise a ranking or force Google to display a particular result.

## Implemented signals

- Homepage absolute title: **Waleed Zone | وليد زون — تطبيقات وألعاب**. No extra title-template suffix.
- Homepage description describes the actual catalog, versions, sizes, platforms, download links and bilingual search. It does not claim that every file already has direct delivery.
- Visible homepage H1: **وليد زون — تطبيقات وألعاب**; the English brand is visible immediately above it.
- Homepage, navigation, footer and detail breadcrumbs link to `/apps` and `/games`; existing homepage sections remain available. Directory links use ordinary HTML navigation, avoiding speculative catalog prefetches and ensuring destination document metadata replaces detail metadata. The loading header uses the same destinations and homepage brand heading.
- Apps/Games are server-rendered directories of actual public catalog entries, not keyword doorway pages. They reuse `getAllAppsSitemap()` and the existing app/game classification; show 24 links per page; expose real pagination; reject pages outside the available range.
- Every touched public page owns its title, description, canonical, Open Graph URL and Twitter metadata. App/game descriptions begin with the actual name and available version/size, so a repeated source description does not overwrite the item's identity.
- Category pagination has distinct titles/descriptions, a self-canonical URL and CollectionPage URL matching the current page. Case variants redirect to the actual stored category.
- No keyword list, hidden brand text, keyword stuffing or invented download safety/rating claims were added.

## Structured data

`WebSite` appears once on the unfiltered homepage, with `name: Waleed Zone`, `alternateName: وليد زون`, the homepage URL and Arabic language. It is not repeated on Privacy, account pages or detail pages. No speculative SearchAction was added.

No site-level Organization is emitted: the current public About content describes a catalog, not a verified business entity. Likewise, a developer name alone does not establish that the developer is an Organization; the former inferred Organization author on SoftwareApplication was removed. Developer information remains visible.

SoftwareApplication fields continue to come from existing visible catalog data. No offers, fake ratings, reviews or signed/private download URLs are emitted. This markup does **not** establish eligibility for a Google software-app rich result when its additional required data is unavailable.

BreadcrumbList positions are consecutive and match real navigation. Detail breadcrumbs use the Apps/Games landing pages, rather than fragment URLs. Category ItemList entries now use `appHref()` clean detail URLs rather than legacy `/app/{id}` redirects; list counts describe the entries rendered on the current page.

## Indexing policy

| Routes | Indexing policy | Canonical/sitemap policy |
|---|---|---|
| `/` | Index, follow | Homepage canonical; included |
| `/apps`, `/games` | Index, follow when nonempty; empty directories noindex | Self-canonical; only nonempty landing roots included |
| Catalog pagination | Index, follow while valid | Self-canonical with `?page=N`; discovered by pagination links, not added to sitemap |
| `/apps/[slug]`, `/games/[slug]` | Index, follow for published, active entries | Existing clean URL; public entries only in sitemap |
| `/category/[category]` | Index, follow for available content | Canonical category URL, including valid page number; category roots in sitemap |
| `/about` | Index, follow | Self-canonical; included |
| Homepage search/filter/browse variants | Noindex, follow | Existing homepage canonical preserved; excluded |
| `/privacy` | Noindex, follow in metadata and response header | Self-canonical `/privacy`; excluded; available in footer and crawlable |
| `/terms` | Noindex, follow response header reserved | No page exists in this baseline; no fabricated Terms page or sitemap entry |
| `/login`, `/register` | Existing noindex metadata plus noindex response header | Excluded; crawlable so robots can observe noindex |
| `/account`, administrative/private routes | Existing noindex/private headers and crawl exclusions retained | Excluded; existing authorization untouched |
| `/api/*` | Existing noindex/nofollow/noarchive header | Excluded; robots.txt no longer prevents observing the noindex header |
| `/download/*` including request/token query variants | Noindex/nofollow/noarchive response header | Excluded; guard covers the planned route before Agent H lands it |

Privacy's noindex is a deliberate product policy: it removes that page from search while keeping the policy available to readers. It is not a duplicate of the homepage and therefore must **not** canonicalize to the homepage. Terms does not yet have content; its reserved header is not a claim that legal terms have been written or approved.

Robots.txt is generated at runtime so its sitemap host follows the same configured `SITE_URL` as page metadata and the dynamic sitemap. Utility/API/download/legal URLs are not blocked there, allowing noindex discovery. Existing private-route exclusions remain in place. Crawl directives and noindex are not authorization controls.

Next.js normalizes the homepage canonical to the bare origin when trailing slashes are disabled. WebSite, breadcrumb root and sitemap use that same form. Other paths keep their existing no-trailing-slash canonicals. No domain migration, redirect overhaul or stale PR #4 merge was performed.

## Verification

Run with the project's Node 20.19.5 runtime:

```sh
npm run typecheck
npm test
npm run lint
npm run build
WZ_SEO_FIXTURES=true npm run test:integration
```

The integration command requires a dedicated **empty local** `wz_phase2_test` database (or allowed suffix), never a production database. Browser coverage additionally uses the existing optional `WZ_BROWSER_TESTS=true` and isolated `WZ_BROWSER_MODULE` tooling. `WZ_TEST_PORT` permits independent local test sessions without port collisions. CI runs all unit tests and includes SEO fixtures/integration/browser checks.

Coverage includes rendered titles/descriptions and duplicates, canonicals and social URLs, homepage identity, real BreadcrumbList/CollectionPage/SoftwareApplication data, robots and sitemap host agreement, all fixture sitemap URLs returning public indexable pages, inactive/unpublished records, private/API/legal/token exclusions, empty directories, invalid pagination, distinct page-two metadata and directory-navigation metadata replacement. Unit tests skip local integration when no fixture configuration is supplied; the integration runner executes those checks separately.

For Next's streamed not-found responses, the test permits HTTP 200 or 404 but requires `noindex` and no CollectionPage data. This follows Next's documented behavior rather than treating streamed status alone as evidence of an indexable page.

### Local verification results and environment limitations

- `npm run typecheck`, `npm test`, `npm run lint` and `npm run build` passed. The default unit invocation reports 59 passing tests and 41 integration tests skipped without local fixture configuration; the dedicated integration invocation executes and passes all 41.
- Production browser verification passed 15 existing flows and 21 SEO checks at 360, 768 and 1440px, with no console/runtime errors in the final run.
- The environment defaults to Node 24, outside this project's declared engine. Verification used Node 20.19.5 instead; no dependency versions were changed.
- Native PostgreSQL could not start in this environment because of restricted user switching/ownership operations and missing native client libraries. Local fixtures instead ran against an isolated, in-memory PGlite PostgreSQL socket. CI retains its PostgreSQL 16 service, so native PostgreSQL CI confirmation remains a separate check.
- The optional agent-browser CLI daemon failed to start here. Browser verification completed with the installed Playwright Chromium tooling. Production CSP also rejected an evaluation-based polling helper; the tests use locator polling without weakening CSP.
- Production testing exposed aborted client navigation to directory routes. Directory entry links now use normal document navigation; the final browser checks verify both the destination and its metadata. This was treated as a runtime issue and fixed, rather than attributed to the environment.

## Remaining risks and release follow-up

1. **Not deployed:** this branch is for PR review only. The public site's existing results remain until the changes are merged and published through the normal release process.
2. **Recrawl delay and selection:** Google decides rankings, site names and canonical selection. Privacy can remain in results until recrawled. After deployment, inspect `/`, `/privacy`, `/apps`, `/games` and sample detail pages in Search Console, submit the sitemap and request homepage recrawling. Search Console actions were not performed here.
3. **Origin configuration:** keep `NEXT_PUBLIC_SITE_URL` set to the chosen production origin during build and runtime. Do not point a deployed production build at a preview URL. Preview deployments need their own environment-wide indexing policy; this PR does not change hosting infrastructure.
4. **Source content:** distinct prefixes address reused descriptions in the tested catalog. Two genuinely duplicated records with identical names, versions and sizes still require editorial deduplication; invented metadata is not a remedy.
5. **Catalog scale:** landing pagination currently reads existing lightweight public sitemap summaries and slices them in memory. This avoids new schema/search logic. A substantially larger catalog can later use equivalent database pagination without changing classification or index policy.
6. **Phase 3 integration:** retain the `/download/*` and `/api/*` noindex response headers when merging Agent G/H. Validate the actual new pages and error/redemption responses after integration; this branch does not implement or test the download lifecycle.

## Primary references

- Google site names: https://developers.google.com/search/docs/appearance/site-names
- Google title links: https://developers.google.com/search/docs/appearance/title-link
- Google noindex and crawl access: https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Google canonicals: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google software-app structured data: https://developers.google.com/search/docs/appearance/structured-data/software-app
- Google breadcrumbs: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- Next.js metadata: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js streamed not-found responses: https://nextjs.org/docs/app/api-reference/file-conventions/not-found
