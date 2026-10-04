# WALEED ZONE Web

Arabic, right-to-left catalog for Waleed Zone's apps and games, connected to its Telegram bot. Built with Next.js 15, TypeScript, Tailwind, and PostgreSQL. The [visual identity](BRAND.md) includes the new mark, colors, typography, and components.

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set `DATABASE_URL` to a PostgreSQL database with the bot's `applications` table. Set `NEXT_PUBLIC_SITE_URL` to the public HTTPS origin in production, and configure independent random `VISIT_KEY_SALT` and `WEBSITE_STATS_TOKEN` secrets. Do not commit `.env.local`.

## Features

- Searchable and paginated catalog with category and detail pages.
- Dedicated titles, descriptions, canonical URLs, Open Graph metadata, sitemap, and JSON-LD.
- Visitor registration, login, seven-day sessions, and saved favorites.
- Responsive dark identity with locally hosted Arabic and English fonts.
- Conditional AdSense integration, off by default. See [security and advertising setup](SECURITY.md).

The site creates four `site_*` account tables on the first account request. Production credentials need schema creation and table read/write privileges. The application listing schema is owned by the Telegram bot. Keep its publishing credentials separate if possible. There is currently no email verification or password recovery; add a verified mail provider before depending on these features for high-value accounts.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

For production, set the Railway service to build from this repository, configure its PostgreSQL connection, check signup/login/logout and a favorite on the real database, and monitor application logs. [Security and DDoS procedures](SECURITY.md) explain the limits of application-side rate limiting and the Railway WAF settings needed during an attack.

## Advertising

AdSense verification and serving are separate. A valid `ADSENSE_PUBLISHER_ID` publishes account metadata and `/ads.txt` while advertising stays off. Serving requires **all five** gates: valid publisher ID and exact `true` values for `ADSENSE_CONTENT_REVIEWED`, `ADSENSE_SITE_APPROVED`, `ADSENSE_PRIVACY_READY`, and `ADSENSE_ENABLED`. Manual placement and a live certified CMP consent decision are additional requirements. See [Phase 9 readiness and owner checklist](docs/PHASE9_MONETIZATION_READINESS.md). Leave all switches false during preparation; no code change grants Google approval.

## Related project

[Waleed Zone Telegram Bot](https://github.com/waleednjlaty/MyTelegramBot)

Operator pre-deploy remains `npm run migrate:release` (001 → 002 → 003 → 005; optional 004 excluded). The new checksum-locked migration and read-only `npm run monetization:audit` require an explicitly configured DATABASE_URL. No production execution is part of this PR. See [content guide](docs/MONETIZATION_CONTENT_GUIDE.md), [activation checklist](docs/ADSENSE_ACTIVATION_CHECKLIST.md), and [CMP setup](docs/ADSENSE_CMP_SETUP.md). First-party metrics contain aggregate daily counters only; the owner can inspect Today/7/30-day reports in Admin Analytics. PUBLIC_CONTACT_EMAIL is optional and must be a real intended public address.
