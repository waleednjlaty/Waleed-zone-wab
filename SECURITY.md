# Security and deployment

## Accounts

Visitor passwords use salted scrypt hashes. Sessions use random opaque tokens in HttpOnly, Secure production cookies; the database stores token hashes. Same-origin checks protect write endpoints. Database rate limits slow repeated login, registration and favorite requests. TLS, database backups, and secret rotation are deployment responsibilities.

The application creates `site_users`, `site_sessions`, `site_favorites`, and `site_rate_limits` on the first account request. The production database user therefore needs `CREATE` in its schema and read/write access to these tables. Use a separate schema or narrowly scoped role if possible. Keep catalog publishing rights with the bot. Test the registration flow before announcing visitor accounts. Email verification and self-service password recovery require a verified email sender and are not available yet.

## DDoS

Application rate limits cover only selected write endpoints, after traffic reaches the server. They are not a network DDoS shield. Railway states its infrastructure protects at network layers 4 and below; application layer floods need edge controls. Configure Railway Edge Rules to block or challenge abusive traffic. In an active application layer attack, temporarily enable **WAF Under Attack Mode** in Railway's Networking settings, then disable it when the incident ends. The challenge can block the Telegram bot, Google crawlers, and other legitimate non-browser clients, so do not keep it on permanently. Monitor 429/5xx rates and Railway metrics and scale if needed. Use a trusted CDN/WAF with rate limiting ahead of Railway if sustained traffic requires it.

Sources: [Railway DDoS](https://docs.railway.com/networking/ddos-protection), [Railway WAF](https://docs.railway.com/networking/waf), [Railway Edge Rules](https://docs.railway.com/networking/edge-rules), [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

## AdSense

The code includes a validated publisher ID, conditional account metadata, conditional Auto Ads script, and `/ads.txt`. All remain disabled unless `ADSENSE_PUBLISHER_ID=ca-pub-<16 digits>`, `ADSENSE_CONTENT_REVIEWED=true`, and `ADSENSE_ENABLED=true` are configured. Do not enable these flags until the catalog and download destinations have been reviewed against Google Publisher Policies and the site has been approved. Some current app listings may involve unlicensed or modified software; no code change grants AdSense approval. Update the privacy notice and test the Content Security Policy against live ads before enabling. The canonical production domain must be added to the AdSense account.

Sources: [AdSense site connection](https://support.google.com/adsense/answer/7584263), [Google Publisher Policies](https://support.google.com/adsense/answer/10502938), [Enabling dishonest behavior](https://support.google.com/adsense/answer/1348688).
