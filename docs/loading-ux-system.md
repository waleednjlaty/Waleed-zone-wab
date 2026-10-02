# Loading UX system — Agent B

This branch starts at `3e16c6c` on `agent/loading-ux-system` and addresses issue #9.
It changes presentation only; search, queries, auth, API, schema, page routing and
metadata are unchanged. No package or lockfile changes are needed.

## Components

Import directly from `src/components/loading/`:

| Component | Usage |
| --- | --- |
| `Skeleton` | Decorative text/block primitive, always hidden from assistive technology |
| `ImageSkeleton` | `icon`, 2:1 `artwork`, 9:16 `screenshot`, or absolute `fill` within an already sized image wrapper |
| `CardSkeleton` | `compact`, `row`, or `featured`; optional `ranked` for discovery rails |
| `ListSkeleton` | `grid`, `list`, `rail`, or `featured`; defaults to six cards |
| `SectionSkeleton` | Heading/subtitle slots plus a list, with optional known heading or custom children |
| `LoadingRegion` | One polite Arabic status announcement outside the busy, decorative visual subtree |
| `SearchResultsSkeleton` | Twelve catalog results, without replacing the usable search input |
| `DetailsSkeleton` | Icon/title/developer, version/size slots, optional screenshots, description, file details, and related apps |
| `ContentState` | Shared empty/error presentation, configurable heading level and caller-owned action |

All skeletons are server-compatible and need no effect or timer. A component
imported by an existing client component simply becomes part of that client graph.
`ContentState` accepts an action node rather than owning retry/fetch logic. Pass a
button with the existing callback from a client caller, or a link from a server caller.

Wrap standalone `ListSkeleton`/`SectionSkeleton` in one `LoadingRegion`. Do not nest
announcements for every card. Skeleton blocks themselves are not focusable. Labels
and `headingLevel` are configurable for the caller's context.

## Integration already included

- Existing `src/app/loading.tsx` continues to use `CatalogSkeleton` unchanged.
- Existing named `CardSkeleton`, `SearchSkeleton`, and `NavigationSkeleton` exports
  remain compatible with their current imports.
- `CatalogSkeleton` keeps known intro copy and the existing discovery section order.
- `NavigationSkeleton` now renders static, functional navigation while Navbar waits
  for categories/session data. It does not infer authentication or skeletonize the
  header. Its native mobile menu works without hydration.
- `CoverImage` shows a sized skeleton only while an actual safe image is pending.
  Missing/failed images retain the meaningful existing fallback. No loading/failure
  callbacks, URL validation, or lazy/cached image behavior were replaced.
- Existing `EmptyState` retains the same props/copy/link and uses `ContentState`.
- Existing route error UI keeps the original `reset()` callback and uses the same
  surface, spacing, tokens and accessible action as empty states.
- Privacy/about have local null loading boundaries, preventing an inherited catalog
  skeleton from covering static informational copy. There is no Terms route on this
  branch. Keep any future Terms loading fallback static/null too.

## Handoff to Agent A

1. Use `SearchResultsSkeleton` at the results-only Suspense boundary. The existing
   root discovery fallback cannot know whether pending searchParams represent search
   or browse; this branch deliberately does not change that logic.
2. Use `DetailsSkeleton` after the final App/Game Details layout is known. It is not
   attached to the current `/app/[id]` page: that page currently has a large 2:1 hero
   image and a 340px download sidebar, while the planned layout is icon-led and has
   screenshots. Adjust its isolated dimensions to the actual final layout before
   wiring App/Game loading files. Set `screenshots={0}` when the page has no gallery
   and align `relatedCount` with the actual query size.
3. Place `SectionSkeleton`/`ListSkeleton` at the matching catalog/category boundary,
   retaining known headings and controls outside the busy visual region where possible.
   Root loading remains the original broad boundary; it is not a universal fallback
   for account/auth pages or all future routes. Override it locally with a matching
   fallback or static/null UI as those routes evolve.
4. Use `ContentState` for new search empty/error states and pass the existing retry
   action. Do not put request orchestration in this presentation component.
5. Never use these skeletons for the planned 15–20 second download wait. Use explicit
   countdown/progress with its own accessible status.

## Motion and layout

Styles are isolated in `loading.module.css`; `globals.css` is unchanged. Legacy
skeleton selectors remain unused by the migrated components for compatibility.
Cards reuse the real `app-card` body, icon, category, metadata and grid/rail classes,
so their breakpoints, font metrics and artwork aspect ratios remain aligned.
Variable final text/unknown galleries can still change geometry; reserve dimensions
from the real layout instead of claiming universally zero CLS.

Shimmer is a low-contrast 4% white sweep over charcoal every 2.8 seconds. The visual
region reserves space immediately and appears after 160ms using CSS only. This
reduces a brief fallback flash without delaying the request, result or unmount.
`prefers-reduced-motion: reduce` disables the shimmer and reveal entirely and shows
the static placeholder immediately. No minimum loading duration is imposed.

## Verification

- Node 20.19.5, matching the repository's declared runtime range.
- `npm run typecheck` and `npm run build`.
- ESLint on all changed TSX files, via the existing ESLint dependency, plus
  `npm run lint` (Next.js reports its existing deprecation notice).
- No test files or test script existed on the starting branch.
- Temporary, uncommitted preview page and browser checks at 360, 768 and 1440px:
  no document horizontal overflow, no error overlay, no header skeleton; real and
  skeleton compact/row/featured/ranked cards have matching widths and heights for
  a representative single-line title with category and metadata.
- Normal and reduced motion, reserved reveal geometry, keyboard-operated retry,
  pending/missing/failed image states, and home-to-privacy navigation checked.
- The preview route and temporary verification dependencies are excluded from the
  final commit. No database credentials were available; the real home was verified
  in its empty-catalog mode. Populated search/detail data integration awaits Agent A.

References: [Next.js loading boundaries](https://nextjs.org/docs/app/api-reference/file-conventions/loading),
[MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion),
[MDN aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy).


## Completed Phase 2 integration — Agent F

The historical handoff above is now completed on `agent/integration-phase2-phase3`:

- Search fetch/debounce/ranking/cancellation are retained from Agent A. Suggestion loading uses three reusable decorative rows and one announcement.
- Home catalog queries execute inside a keyed Suspense content region; the intro/search remain usable while the result area waits. Discovery uses the existing catalog fallback without duplicating the intro or shell.
- Details skeletons reuse the final Phase 2 summary/content/sidebar classes, default to no invented screenshots, and are attached to `/apps/[slug]` and `/games/[slug]`.
- Category navigation has a local results fallback. Account/login/register use null local loading boundaries; pre-stream authorization in the root layout and API guards are retained.
- The EmptyState conflict keeps Agent A's bilingual suggestion copy and Agent B's shared ContentState presentation.
- No minimum waiting time, direct-download runtime, schema or runtime dependencies were introduced.
