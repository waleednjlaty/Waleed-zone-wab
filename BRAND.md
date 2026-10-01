# Waleed Zone — visual identity

A compact Arabic app store: content first, dark neutral surfaces, and a single cyan accent. Mobile starts with the product name, a short heading, search, and actual catalog content.

## Design tokens

Tokens live in `src/app/globals.css` and are shared by navigation, catalog, loading states, and existing controls.

| Token | Value | Purpose |
| --- | --- | --- |
| `--bg` | `#0B0D10` | Page background |
| `--surface` | `#12151A` | Cards, search, footer |
| `--surface-2` | `#171B21` | Raised surfaces, image fallback |
| `--text` | `#F4F6F8` | Primary text |
| `--muted` | `#A3ADBA` | Supporting text |
| `--brand` | `#22C7E8` | Active navigation, focus, primary actions |
| `--line` | `#2B323C` | Control borders |
| `--success` | `#77CCA2` | Success feedback |
| `--warning` | `#E9BA69` | Warnings |
| `--error` | `#F58B8B` | Error feedback |
| `--radius` | `14px` | Cards and search |
| `--radius-small` | `12px` | Controls and icons |
| `--motion` | `180ms` | Interaction transitions |

## Typography and layout

- Arabic: IBM Plex Sans Arabic; Latin: Inter. Both are self-hosted through Fontsource, with `font-display: swap`.
- Body: 16px; labels: 14px; secondary metadata: 12–13px.
- Mobile gutters: 16px; tablet: 24px; desktop: 32px. Maximum container width: 1240px.
- Quiet borders instead of heavy shadows. No decorative backgrounds, neon effects, or gradients.
- Respect reduced motion. Visible cyan keyboard focus, a skip link, labelled search, native dialog focus handling, and 44px controls.

## Mark

`Brand.tsx` reads `public/wz-mark.svg`. The existing lime asset has been replaced with a simple white/cyan WZ fallback; no separate approved channel logo was present. Replace that file to install the final brand artwork, and mirror it to `src/app/icon.svg` for the favicon. The wordmark is **Waleed Zone**. Telegram remains a community link.

## Component system

- `Navigation`: desktop navigation, category dropdowns, inline mobile menu, and native search dialog.
- `SearchBar`: existing URL search with a 450ms debounce, real submit/clear controls, and optional suggestions from the loaded catalog. Dialog search submits explicitly.
- `AppCard`: one component with compact, row, and featured variants; every card links to the existing detail route. Missing images get a neutral grid fallback.
- `SectionHeading`, `AppGrid`, `CategoryPills`, and `Brand`: shared presentation primitives.
- `CatalogSkeleton`: heading, icon-card, search, and artwork placeholders via Next.js `loading.tsx`.

## Data boundaries

No schema, API, authentication, advertising, or download changes are included.

- Discovery collections use at most the latest 48 published entries through the existing query. The final library keeps the original 12-item pagination.
- Popular entries are ordered by downloads where recorded, otherwise views. The subtitle states that this is a selection from the latest additions. If neither metric exists, the subtitle explicitly says these are latest additions.
- “Latest updates” presents published entries with a version. There is no `updated_at` field or version history, so the UI describes them as recently added versions and does not invent an Updated badge.
- Games are recognized by existing game category labels (Arabic/English); other categories remain apps. This is a display classification, not a schema change.
- Android minimum requirements and missing file sizes are not invented. MOD appears only when the item name explicitly says MOD or modified.
- Featured selections come from the latest published content, not a new editorial backend.
- No Terms route exists. The footer marks it as forthcoming instead of shipping invented legal terms.

## Scope of this phase

Homepage, global layout, navigation, search presentation, reusable cards, footer, responsive behavior, and loading states. Detail layouts, account flows, download behavior, backend/database, and existing ad settings remain for their respective later phases.
