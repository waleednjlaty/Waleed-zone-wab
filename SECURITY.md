# Security and deployment

## Accounts

Visitor passwords use salted scrypt hashes. Sessions use random opaque tokens in HttpOnly, Secure production cookies; the database stores token hashes. Same-origin checks protect write endpoints. Database rate limits slow repeated login, registration and favorite requests. TLS, database backups, and secret rotation are deployment responsibilities.

The application creates `site_users`, `site_sessions`, `site_favorites`, and `site_rate_limits` on the first account request. The production database user therefore needs `CREATE` in its schema and read/write access to these tables. Use a separate schema or narrowly scoped role if possible. Keep catalog publishing rights with the bot. Test the registration flow before announcing visitor accounts. Email verification and self-service password recovery require a verified email sender and are not available yet.

## DDoS

Application rate limits cover only selected write endpoints, after traffic reaches the server. They are not a network DDoS shield. Railway states its infrastructure protects at network layers 4 and below; application layer floods need edge controls. Configure Railway Edge Rules to block or challenge abusive traffic. In an active application layer attack, temporarily enable **WAF Under Attack Mode** in Railway's Networking settings, then disable it when the incident ends. The challenge can block the Telegram bot, Google crawlers, and other legitimate non-browser clients, so do not keep it on permanently. Monitor 429/5xx rates and Railway metrics and scale if needed. Use a trusted CDN/WAF with rate limiting ahead of Railway if sustained traffic requires it.

Sources: [Railway DDoS](https://docs.railway.com/networking/ddos-protection), [Railway WAF](https://docs.railway.com/networking/waf), [Railway Edge Rules](https://docs.railway.com/networking/edge-rules), [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

## AdSense

A valid publisher ID enables verification metadata and `ads.txt`, without loading Google's advertising SDK. Serving requires the five fail-closed gates described in [Phase 9](docs/PHASE9_MONETIZATION_READINESS.md), a manual slot, an owner-reviewed page, and a live consent decision from the configured certified CMP. No global SDK or Auto Ads activation code is installed. The owner must also leave Auto Ads **off in the AdSense account**.

Owner-only review endpoints inherit session authorization, origin validation, CSRF binding, rate limits, bounded bodies, strict field validation, no-store responses, and catalog/review revision checks. The additive `005_monetization.sql` migration is operator-run only; no production migration was applied. Missing tables or DB outages deny advertising. Review notes are internal and never returned through public catalog APIs. Content/source changes withdraw prior eligibility; counters and review edits leave catalog revisions unchanged.

A rights basis or owner attestation does not grant redistribution rights, verify identity, certify a CMP, or prove Google approval. Review linked destinations as well as the page. Existing Telegram delivery and the server countdown remain unchanged. No ad appears on countdown/download, admin, account, authentication, search, or listing pages.

Sources: [AdSense site connection](https://support.google.com/adsense/answer/7584263), [Google Publisher Policies](https://support.google.com/adsense/answer/10502938), [Enabling dishonest behavior](https://support.google.com/adsense/answer/1348688).
