# Phase 2 core — Agent A / issue #8

Branch: `agent/phase2-core-search-security`. Do not merge automatically.

## Scope and integration boundaries

The approved cyan theme, homepage sections, accounts and current Telegram/external download destinations are preserved. Core adds shared app/game details, readable canonical URLs, advanced server search, related content, optional version metadata and authorization. No storage, download tokens, direct-download infrastructure, admin UI, ads or loading-system refactor is included.

Agent B owns loading components/route `loading.tsx` files. Agent A adds detail-specific styles at the end of `globals.css`; potential shared integration files are `globals.css`, `layout.tsx`, `SearchBar.tsx`, `page.tsx` and `package.json`. Preserve each branch's functionality when combining them. Agent C's architecture documents should use the existing CTA/download destinations as their starting point; no runtime download contract was introduced here.

## Details, data and URLs

- `/apps/<name>-<id>` and `/games/<name>-<id>` use a shared details component. IDs keep duplicate names safe. Wrong slugs or types redirect to the current canonical path.
- `/app/<id>` remains a permanent HTTP 308 redirect, based on the configured public origin rather than Railway's internal request origin. Unpublished/inactive/nonexistent IDs return 404.
- Details show only existing fields. `created_at` is **date added**, not a fabricated update date. Download counts are displayed only when present and positive. No assumed ratings, prices or free-offer markup is generated.
- The bot's existing `applications` table is unchanged. Optional publisher-verified fields can be added to `src/data/catalog-details.json`, keyed by numeric catalog ID. It is empty deliberately: production has no screenshots or historical versions in its current schema.
- Optional fields: `arabicName`, `englishName`, `aliases`, `tags`, `android`, `architecture`, `packageName`, `fileType`, `updatedAt`, `screenshots: [{url, alt}]`, `changelog`, `modInfo`, `versions: [{version, releaseDate, size, android, architecture}]`. Add verified data only. The data access function is replaceable with a database provider later.
- Screenshots use native horizontal scrolling with the next image visible on mobile and lazy image loading. Description expands on demand. Previous versions display only available metadata. Empty history has a clear explanation and no fake download buttons.
- Related content is scored by category, developer, curated tags and shared name tokens, with app/game separation. It is not a latest-items section.
- Mobile download bar appears only after the primary CTA passes above the viewport. Content has bottom space for the bar.
- Unique metadata, canonical/OpenGraph URLs, SoftwareApplication and BreadcrumbList JSON-LD are produced from actual catalog data. Sitemap reads the current public catalog at request time and excludes private routes.

## Authorization matrix

| Route | Access | Enforcement |
|---|---|---|
| `/api/stats` | Owner session, or existing scoped owner statistics credential | Server guard before queries; anonymous 401, non-owner 403 |
| `/account` | Authenticated user's own library | Root pre-stream check plus independent page/session check; unauthenticated 307 to login |
| `POST/DELETE /api/favorites` | Authenticated user's own favorites | Server session ID, same-origin writes, published-app validation, rate limits |
| `/api/auth/login`, `/register`, `/logout` | Existing account actions | Same-origin JSON writes, bounded body, existing scrypt/session/rate-limit protections |
| `POST /api/visit` | Public write-only visit receipt | Existing origin checks and HMAC keys; no visitor data read API |
| `GET /api/search` | Public published-only DTO | Explicit whitelist of icon/name/category/developer/ID/path; no publishing flags or download URLs |
| `/users`, `/admin`, `/dashboard`, `/settings`, `/database`, `/debug`, `/logs`, `/uploads`, `/private`, `/manage`, `/management` and corresponding internal APIs | Not implemented | 404; no dashboard or user-list endpoints were created |

Set **`OWNER_USER_ID`** on the server to the stable `site_users.id` of the chosen existing account. If unset, no visitor session has owner rights. Never assign ownership by email or accept roles/IDs from registration. The existing **`WEBSITE_STATS_TOKEN`** remains supported **only** for statistics automation; it is not a general administrative credential. It remains private and is compared in constant time. Owner ID configuration and production credential rotation require access to the deployment environment, unavailable in this workspace.

Root route context is overwritten by middleware and encoded safely for Arabic paths. Data/API authorization remains independent of that context. Session tokens are opaque, HttpOnly and Secure in production; only hashes are persisted. Private responses have no-store/noindex headers. Noindex and robots rules are not access controls.

Sensitive file paths/extensions are rejected server-side; browser production source maps are explicitly disabled. No genuine secret was found in tracked source/public assets. The PostgreSQL URL in README_AR is a placeholder, not a deployed credential. JSON auth body reads now stop after 4 KiB instead of buffering an arbitrarily large body. Duplicate PostgreSQL pools were consolidated into one existing pool.

## Search behavior

1. Search representations remove Arabic marks/tatweel, normalize alef forms and final alif maqsura, lowercase, trim, collapse spaces and normalize separators. Display data is unchanged. ة/ه matching is an additional lower-ranked alternative.
2. Bilingual aliases live in a vocabulary module; per-app aliases/tags live in catalog metadata. Aliases are not attached to unrelated names merely containing a popular app's name.
3. Candidate generation is separate from ranking. The current **19 public production entries** justify a small server index with 30-second caching and a 2,000-document ceiling. Only the top eight public DTOs reach autocomplete; the result page has at most 60 relevant results, with existing pagination.
4. Above that ceiling, bounded PostgreSQL candidates include aliases and curated IDs, prioritize exact/prefix names before limiting to 500, then use the same ranker. This fallback is not a replacement for a dedicated indexed provider at a genuinely large scale. SearchProvider permits that migration without replacing the UI.
5. Ranking: exact displayed name > exact alias > normalized exact > prefix > transliteration > token relevance > developer/category/tags > bounded edit distance > keyboard-layout fallback > description. Prefix precision is part of relevance; downloads break equal-relevance ties only.
6. Fuzzy matching requires at least four characters, one edit for short words and at most two for longer words, with a minimum length ratio. Description is limited to 400 server-side characters and cannot outrank name matches.
7. UI requests debounce for 220 ms, abort superseded requests and guard against stale responses. Search submission opens the ranked result page. Empty and zero-result states have useful navigation. The provider has an injectable, non-persistent observer seam for future aggregate search analytics; no personal analytics system was added.

## Indexes and deployment

`scripts/catalog-indexes.sql` supplies three additive partial indexes for public ID ordering, category/ID filtering and developer-related queries. Apply with `psql` separately (CONCURRENTLY cannot run inside a transaction). These were validated against an isolated PostgreSQL-compatible test database; **they have not been applied to production**, because DATABASE_URL is not available here. No extensions, destructive migration or search infrastructure dependency is required.

The tiny fixture query naturally chooses a sequential scan; this is expected for tens of rows. Review EXPLAIN against real production growth before adding full-text/trigram indexes. Never index every column indiscriminately.

## Verification

Verified against the production build: 46 pure/search/detail tests; 34 API/security tests on a small fixture catalog; the same 34 tests also pass with 2,101 additional unrelated records (bounded PostgreSQL provider). Eight browser flows pass with zero console/page errors and zero HTTP error responses. Normal canceled prefetch and superseded search requests are expected. Widths 360/768/1440 have no horizontal overflow; mobile primary CTA ends at about 347px. The six homepage sections remain intact.

Review images: [actual catalog detail on mobile](phase2-review/mobile.jpg), [desktop test fixture](phase2-review/desktop-fixture.jpg), [tablet test fixture](phase2-review/tablet-fixture.jpg). Fixture names/descriptions/counts and the shared image in tablet/desktop screenshots are QA data only, never production listings.

`npm run typecheck`, `npm run lint` (zero warnings/errors) and `npm run build` pass with Node 20. The pre-existing next-lint command emits a deprecation notice; framework tooling migration is outside scope.

To reproduce the API tests after building, create an **empty local database** named `wz_phase2_test` and run `WZ_TEST_DATABASE_URL=<local-test-connection> npm run test:integration`. The runner refuses remote hosts and existing application/user tables, creates test-only users/catalog/session fixtures, starts the production build on port 3100, runs all 34 tests, removes temporary credentials and stops the server. It leaves the dedicated test database intact for inspection. No new test dependencies are required. `npm test` runs pure ranking/normalization/URL tests. Integration tests run only when WZ_TEST_CONFIG is provided and refuse non-local base URLs; the fixture database includes separate owner/visitor sessions, private drafts and synthetic names for all required bilingual cases. No test writes to production.

Sources: [Next.js 15 data security](https://nextjs.org/docs/15/app/guides/data-security), [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
