# Phase 2 core — changed files

Relative to the assigned branch at phase-one main.

| Change | File |
|---|---|
| Modified | `.env.example` |
| Added | `docs/PHASE2_CORE.md` |
| Added | `docs/PHASE2_FILES.md` |
| Added | `docs/phase2-review/desktop-fixture.jpg` |
| Added | `docs/phase2-review/mobile.jpg` |
| Added | `docs/phase2-review/tablet-fixture.jpg` |
| Modified | `next.config.js` |
| Modified | `package.json` |
| Added | `scripts/catalog-indexes.sql` |
| Added | `scripts/test-integration.mjs` |
| Added | `src/app/api/search/route.ts` |
| Modified | `src/app/api/stats/route.ts` |
| Removed | `src/app/app/[id]/page.tsx` |
| Added | `src/app/app/[id]/route.ts` |
| Added | `src/app/apps/[slug]/page.tsx` |
| Added | `src/app/games/[slug]/page.tsx` |
| Modified | `src/app/globals.css` |
| Modified | `src/app/layout.tsx` |
| Modified | `src/app/page.tsx` |
| Modified | `src/app/robots.ts` |
| Modified | `src/app/sitemap.ts` |
| Modified | `src/components/AppCard.tsx` |
| Modified | `src/components/EmptyState.tsx` |
| Modified | `src/components/Navigation.tsx` |
| Modified | `src/components/SearchBar.tsx` |
| Added | `src/components/details/DetailPage.tsx` |
| Added | `src/components/details/DownloadActions.tsx` |
| Added | `src/components/details/ExpandableDescription.tsx` |
| Added | `src/components/details/Screenshots.tsx` |
| Added | `src/components/details/Versions.tsx` |
| Added | `src/data/catalog-details.json` |
| Modified | `src/lib/auth.ts` |
| Added | `src/lib/authorization.ts` |
| Added | `src/lib/catalog/metadata.ts` |
| Added | `src/lib/catalog/resolve.ts` |
| Added | `src/lib/catalog/routes.ts` |
| Added | `src/lib/catalog/seo.ts` |
| Modified | `src/lib/db.ts` |
| Modified | `src/lib/queries.ts` |
| Added | `src/lib/route-access.ts` |
| Added | `src/lib/search/aliases.ts` |
| Added | `src/lib/search/normalize.ts` |
| Added | `src/lib/search/provider.ts` |
| Added | `src/lib/search/rank.ts` |
| Added | `src/lib/search/service.ts` |
| Added | `src/lib/search/types.ts` |
| Added | `src/middleware.ts` |
| Added | `tests/details.cjs` |
| Added | `tests/helpers/typescript.cjs` |
| Added | `tests/integration.cjs` |
| Added | `tests/search.cjs` |

The old `/app/[id]/page.tsx` is replaced by the HTTP redirect handler at the same legacy route. No existing public URL is removed. Loading and skeleton files are intentionally outside this diff.
