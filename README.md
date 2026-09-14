# Waleed Zone Web

[العربية](README_AR.md)

An Arabic-first web catalog for discovering and downloading apps and games published by the Waleed Zone platform. It complements the Waleed Zone Telegram bot by reading published content from PostgreSQL and presenting it through a fast, searchable, SEO-friendly website.

## Features

- Arabic-first, right-to-left interface
- Search by application or game name
- Category filters and paginated results
- Dedicated detail page for each item
- Direct-download and Telegram bot actions
- Responsive dark interface
- Dynamic metadata, Open Graph tags, JSON-LD, sitemap, and robots.txt
- Graceful loading, empty, error, and not-found states
- Read-only database access
- Security headers and parameterized queries
- Ready for Vercel and Neon

## Tech stack

- Next.js 14 with App Router
- React 18
- TypeScript
- Tailwind CSS
- Drizzle ORM
- PostgreSQL / Neon
- postgres.js

## Requirements

- Node.js 18.17 or newer
- npm
- A PostgreSQL database containing the `applications` table

## Quick start

### 1. Clone the repository

```bash
git clone https://github.com/waleednjlaty/ChannelSite.git
cd ChannelSite
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the environment

Linux/macOS:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Set the required values:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Use a read-only PostgreSQL role for the website in production. Never commit `.env.local` or expose the database URL in client-side code.

### 4. Start development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production server |
| `npm run lint` | Run Next.js ESLint checks |
| `npm run typecheck` | Check TypeScript without emitting files |

Before deploying, run:

```bash
npm run lint
npm run typecheck
npm run build
```

## Database

The website expects an existing `applications` table maintained by the Waleed Zone bot or another trusted service. The web application performs read-only queries.

Important fields include:

| Field | Purpose |
|---|---|
| `id` | Application identifier |
| `name` | Display name |
| `description` | Full description |
| `version` | Current version |
| `size` | Download size |
| `category` | Catalog category |
| `platform` | Supported platform |
| `developer` | Developer or publisher |
| `download_url` | Download destination |
| `image_url` | Cover image |
| `created_at` | Publication date |

Keep the schema synchronized with [`src/lib/db/schema.ts`](src/lib/db/schema.ts).

## Project structure

```text
.
├── src/
│   ├── app/
│   │   ├── app/[id]/       # Dynamic application detail page
│   │   ├── layout.tsx      # Root RTL layout and global metadata
│   │   ├── page.tsx        # Searchable catalog home page
│   │   ├── sitemap.ts      # Dynamic sitemap
│   │   └── robots.ts       # Crawler rules
│   ├── components/         # Catalog and navigation UI
│   └── lib/
│       ├── db.ts           # PostgreSQL and Drizzle connection
│       ├── db/schema.ts    # applications table mapping
│       ├── queries.ts      # Read-only catalog queries
│       ├── site.ts         # Site and Telegram configuration
│       └── utils.ts        # Search and pagination helpers
├── .env.example
├── next.config.js
├── package.json
└── tailwind.config.ts
```

## Configuration

Site identity and the Telegram bot URL are defined in [`src/lib/site.ts`](src/lib/site.ts):

```ts
export const SITE_NAME = 'WALEED ZONE';
export const TELEGRAM_BOT_URL = 'https://t.me/WALEED_ZONE_BOT';
```

Set `NEXT_PUBLIC_SITE_URL` to the real production origin so canonical links, Open Graph metadata, robots.txt, and sitemap.xml use the correct domain.

## Deploy to Vercel

1. Import the GitHub repository into Vercel.
2. Keep the detected framework as Next.js.
3. Add `DATABASE_URL` and `NEXT_PUBLIC_SITE_URL` under Environment Variables.
4. Deploy.
5. Verify the home page, one detail page, `/robots.txt`, and `/sitemap.xml`.

For Neon, use the pooled connection string when deploying to a serverless platform.

## Security

- Create a dedicated database role with `SELECT` permission only.
- Keep database credentials in server-side environment variables.
- Rotate credentials immediately if they appear in a commit, log, image, or chat.
- Review the Content Security Policy before adding external scripts or services.
- Validate production with `npm run build` before every deployment.

## Related project

- [Waleed Zone Telegram Bot](https://github.com/waleednjlaty/MyTelegramBot)

## Contributing

Issues and pull requests are welcome. For a large change, open an issue first and describe the expected behavior.

---

Built and maintained by [Waleed Al-Najlat](https://github.com/waleednjlaty).
