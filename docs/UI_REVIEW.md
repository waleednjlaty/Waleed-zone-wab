# Waleed Zone — homepage review

This phase replaces the oversized landing page with a compact Arabic app catalog. Search and actual content are visible immediately. Trending uses a swipeable rail; updates and selected apps use quiet lists; selected games use artwork; categories use text navigation. The final library retains 12-item pagination.

## Identity and implementation

The [design system](../BRAND.md) defines the dark neutral surfaces, cyan accent, IBM Plex Sans Arabic and Inter fonts, 14px corners, 180ms interactions, and 1240px container. The WZ mark is a replaceable white/cyan fallback at `public/wz-mark.svg`. No separate approved channel logo was found.

Main files: `src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/loading.tsx`; shared components `Navigation`, `SearchBar`, `AppCard`, `Footer`, `Brand`, and `CatalogSkeleton`.

No changes to `src/lib`, API routes, the database schema, detail page layouts, account implementations, existing download destinations, or advertising configuration.

## Validation

- TypeScript, ESLint, and production build pass.
- Browser checks at 360 × 800, 768 × 1024, and 1440 × 1000; no horizontal page overflow.
- Mobile menu, category navigation, search dialog focus trap and Escape, actual search results, suggestion-to-detail navigation, clearing search, pagination, empty states, preserved download link, and existing login/register form reachability.
- Keyboard skip link, visible focus, 200% text enlargement, reduced motion, streamed catalog skeleton, and header continuity during loading.
- Original public image sources checked; cached images render, and failed images retain a visible fallback.
- No console or page errors during the tested flows.

### Limits

The browser checks use a temporary QA-only PostgreSQL-compatible database populated from the public catalog. Production credentials were unavailable. Original images were downloaded into a temporary QA cache to avoid slow browser network delivery; production URLs are unchanged. Visit analytics were stubbed during QA to avoid the test database adapter's connection limit. Production authentication sessions and favorite writes have not been exercised.

## Existing data gaps and next phase

- No update history or Android minimum-version field exists. Updates show recently added entries with version data, and missing requirements are omitted.
- Discovery selections cover the latest 48 entries. Popularity uses available download counts, otherwise views; absent metrics are described as latest additions.
- No Terms route exists; the footer marks it as forthcoming.
- Detail redesign, direct downloads, new authentication, admin, backend/database work, advertising, and comprehensive SEO are outside this phase.

## Screenshots

[Mobile](ui-review/mobile.jpg) · [Tablet](ui-review/tablet.jpg) · [Desktop](ui-review/desktop.jpg) · [Loading](ui-review/loading.jpg)

## References

[Next.js loading convention](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [Google Play](https://play.google.com/store/apps), and [Uptodown](https://www.uptodown.com/) informed loading behavior and catalog organization; no third-party layout was copied.
