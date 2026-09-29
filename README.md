# WALEED ZONE Web

Arabic, right-to-left catalog for Waleed Zone's apps and games, connected to its Telegram bot. Built with Next.js 14, TypeScript, Tailwind, and PostgreSQL. The [visual identity](BRAND.md) includes the new mark, colors, typography, and components.

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

AdSense is disabled until you have a publisher ID, have reviewed every catalog item and destination against Google policies, and the site has been approved. Then set `ADSENSE_PUBLISHER_ID`, `ADSENSE_CONTENT_REVIEWED=true`, and `ADSENSE_ENABLED=true`, test the script/CSP and privacy notice, and verify `/ads.txt`. Current catalog content may be ineligible; **do not flip these flags solely to display ads**.

## Related project

[Waleed Zone Telegram Bot](https://github.com/waleednjlaty/MyTelegramBot)
