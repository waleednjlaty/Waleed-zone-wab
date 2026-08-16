# WALEED ZONE — App Catalog

Production-ready, full-stack dynamic web application built with **Next.js 14 (App Router)**,
**Tailwind CSS**, **TypeScript**, and **PostgreSQL (Neon)** using **Drizzle ORM** +
**postgres.js**.

The site renders a dark, RTL, Arabic-first catalog of applications from the existing
`applications` table in Neon, with instant search, category filtering, pagination, per-app
detail pages, Telegram/direct download CTAs, and full SEO (SSR metadata, JSON-LD, sitemap,
robots).

---

## 1. Prerequisites

- **Node.js ≥ 18.17** (Node 20 recommended) and npm
- A **Neon PostgreSQL** database with an existing `applications` table

Existing table structure (already in your DB — the app only reads it):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial | Primary Key |
| `name` | text | App name |
| `description` | text | Description |
| `version` | text | e.g. `2.5.1` |
| `size` | text | e.g. `45 MB` |
| `category` | text | e.g. `Games`, `Tools`, `Editing` |
| `platform` | text | e.g. `Windows`, `Android` |
| `developer` | text | Developer name |
| `download_url` | text | Original direct/shortened link |
| `image_url` | text | Cover image link |
| `created_at` | timestamp | Optional |

---

## 2. Local setup

```bash
npm install
```

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

`.env.local`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/dbname?sslmode=require
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> **Neon note:** on the free tier, use the **pooled connection string** (enable
> `Connection pooling` in the Neon dashboard) so the URL includes `?pgbouncer=true`.

Then run the dev server:

```bash
npm run dev
```

Open http://localhost:3000

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run typecheck  # TypeScript check
```

---

## 3. Deploy to Vercel (free)

1. Push this project to a GitHub/GitLab/Bitbucket repository.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repository.
   Vercel auto-detects Next.js (no framework overrides needed).
3. In **Project Settings → Environment Variables**, add:
   - `DATABASE_URL` — your Neon connection string (pooled, with `?sslmode=require`)
   - `NEXT_PUBLIC_SITE_URL` — your production URL, e.g. `https://waleed-zone.vercel.app`
4. Click **Deploy**. Done.

---

## 4. Project structure

```
src/
├── app/
│   ├── layout.tsx            # Root layout (RTL, dark theme, global metadata)
│   ├── page.tsx              # Home: hero, instant search, category pills, grid, pagination
│   ├── app/[id]/page.tsx     # App detail page (metadata + JSON-LD + CTAs + related)
│   ├── sitemap.ts            # Auto-generated sitemap from the database
│   ├── robots.ts             # robots.txt
│   ├── icon.svg              # Favicon
│   ├── not-found.tsx         # 404 page
│   ├── loading.tsx           # Loading spinner
│   └── error.tsx             # Error boundary
├── components/
│   ├── SearchBar.tsx         # Debounced live search (client)
│   ├── CategoryPills.tsx     # Category filter pills
│   ├── AppCard.tsx / AppGrid.tsx / Pagination.tsx
│   ├── CoverImage.tsx        # Image with graceful fallback placeholder
│   ├── Navbar.tsx / Footer.tsx / EmptyState.tsx
└── lib/
    ├── db.ts                 # Read-only postgres.js client + Drizzle (global singleton)
    ├── db/schema.ts          # Drizzle schema mirroring the `applications` table
    ├── queries.ts            # All parameterized SELECT queries
    ├── utils.ts              # Input sanitization, LIKE escaping, pagination parsing
    └── site.ts               # Site/bot URL configuration
```

---

## 5. Security

- **Read-only by default** — the app contains only `SELECT` queries and GET routes; there are no
  mutating endpoints anywhere in the codebase.
- **Recommended:** create a dedicated read-only Neon role for the app:

  ```sql
  CREATE ROLE readonly LOGIN PASSWORD 'strong_password';
  GRANT CONNECT ON DATABASE your_db TO readonly;
  GRANT USAGE ON SCHEMA public TO readonly;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
  ```

  and connect with that role's credentials.
- **SQL injection** — all queries are parameterized via Drizzle/postgres.js tagged templates
  (`prepare: false` keeps parameters bound server-side, required for Neon pooled connections).
- **Input sanitization** — search input is trimmed, control characters stripped, length-capped
  (100 chars), and `% _ \` are escaped before being used in `ILIKE` patterns.
- **Security headers** — CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Strict-Transport-Security`, and `Permissions-Policy` are applied globally
  in `next.config.js`.

---

## 6. SEO

- Server-rendered pages with `generateMetadata` on `/app/[id]` fetching real-time title,
  description, canonical URL, and Open Graph image straight from the database.
- Schema.org structured data (`SoftwareApplication` or `VideoGame`) injected as JSON-LD on
  every app page for Google rich snippets.
- `sitemap.xml` is auto-generated from all app IDs in Neon; `robots.txt` points to it.
- Semantic markup (`h1`/`h2`, `article`, `nav`, `aria-*`, descriptive `alt` on images).
- **Missing apps** render the custom 404 UI. Because dynamic SSR streams the page shell first
  (a documented Next.js App Router behavior), the HTTP status stays `200` while Next.js injects
  `<meta name="robots" content="noindex">`, so soft-404s never enter Google's index. Only pages
  linked from the catalog (which always exist) are indexed via `sitemap.xml`.

---

## 7. Customization

- Change the site name, description, and Telegram bot URL in `src/lib/site.ts`.
- The "عرض وتنزيل" card button links to `/app/{id}`; the detail page's primary CTA links to
  `https://t.me/WALEEDZONE_BOT?start=app_{id}`.
- To add a `system requirements` field later, add the column to Neon and extend
  `src/lib/db/schema.ts` + the specs grid in `src/app/app/[id]/page.tsx`.
