# Bilingual final download release

Continue `agent/site-english-localization` from `bccd4ede53d8e78389998b22f2a58bc1c3b17775`, preserving the entire PR #54 ancestry and its provider security policy.

Arabic remains the default. A keyboard-accessible AR/EN control sets `wz_locale` with Path=/, SameSite=Lax, a one-year preference lifetime, and Secure on HTTPS. Reloading the current URL obtains a fresh server-rendered document and updates HTML language/direction and all public, owner, legal and download UI. Authentication, favorites and catalog values are unchanged.

Static UI has reviewed English translations; catalog names/descriptions/developers/category keys are never machine translated. Canonical category keys still determine URLs. Dates follow the rendered locale. Directional styling uses logical alignment and only directional chevrons mirror. Error strings stay stable until rendered so switching does not leave the previous language in state.

Server provider retry/error pages read a bounded locale cookie and maintain `default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`. The existing exact server countdown, source revision binding, single-use redemption and finite provider host policy remain intact. No migration beyond the existing additive 006 is added.

## SEO limitation

Arabic and English share the same URL with a preference cookie. Canonicals and sitemap entries remain shared; no `/en` routes or invented hreflang are emitted. A crawler without the cookie normally sees Arabic. Cookie localization does not provide independently crawlable English URLs. Metadata and `inLanguage` follow the rendered locale without changing stored product content.

## Validation and release

Node 20 type/lint/build and focused locale/details/SEO checks are required, followed by the full unit and native PostgreSQL integration/browser CI. The bilingual matrix covers both languages at 360/768/1440, public/legal/auth/account/owner routes, keyboard switching, refresh persistence, session/favorite preservation and countdown labels. Native SteamRIP POST/303, token replay and source fixtures run in both languages; existing Telegram/owner/security/monetization suites remain enabled.

Local embedded PostgreSQL fixtures supplement testing; native PostgreSQL CI is the authoritative concurrency/release gate. Provider fixtures do not prove live upstream/CDN availability or actual Telegram transport. A live challenge must fail closed; no proxy, TLS bypass or challenge solver is introduced.

Merge the bilingual PR containing #54 once all required checks pass; supersede #54 rather than merging the same work separately. Merge green Bot PR #7. Railway `Waleed-zone-wab` already has `npm run migrate:release` configured before deployment; verify migration/build/runtime logs after merge. Only that service and `Waleed-Zone-bot` are in scope. Keep DIRECT_DOWNLOADS_ENABLED and all four AdSense gates false, preserve publisher ID and existing secrets, and keep download/retry routes ad-free.
