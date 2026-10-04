# AdSense activation checklist — operator only

These steps are future operator work. This PR does not create accounts, submit the site, verify identity, configure a real CMP, deploy, or activate ads. Account attestations are not Google approval checks. Do not use fixture publisher/slot/CMP IDs in production.

- [ ] AdSense account created legitimately
- [ ] Correct payee/country/payment details (and required identity/address/tax checks)
- [ ] Publisher ID received
- [ ] Site added to AdSense
- [ ] Site ownership verified
- [ ] ads.txt visible with the real valid account's `pub-` seller ID
- [ ] About published
- [ ] Privacy published and reflects actual providers/settings
- [ ] Terms published
- [ ] Copyright published
- [ ] Contact works; PUBLIC_CONTACT_EMAIL only if a real public address is configured
- [ ] Catalog policy audit completed; destinations/files and site-wide policies reviewed
- [ ] Risky pages blocked/unreviewed
- [ ] Rights basis documented
- [ ] Migration 005 tested in staging and explicitly applied through `npm run migrate:release`
- [ ] Certified CMP selected from Google's current certified list
- [ ] CMP integrated, expected CMP ID confirmed and ADSENSE_CMP_ID configured
- [ ] consent preferences/withdrawal tested; unknown/denied consent produces no SDK request
- [ ] ADSENSE_PRIVACY_READY=true only after the above privacy tests pass
- [ ] Site status Ready/Approved in AdSense
- [ ] ADSENSE_SITE_APPROVED=true
- [ ] ADSENSE_CONTENT_REVIEWED=true
- [ ] Manual slot created and ADSENSE_DETAIL_SLOT_ID configured
- [ ] Auto Ads disabled in the Google account
- [ ] 360/768/1440 placement review passed, with separation from download controls
- [ ] /download has zero ads, along with admin/account/auth/search/legal/API/404/error pages
- [ ] Then and only then ADSENSE_ENABLED=true in a separately authorized release

A valid publisher ID permits verification metadata and ads.txt while every serving gate remains false. No advertising SDK is loaded for verification alone. All serving gates, valid slot, live consent, active/published content, current eligible review and meaningful page content must pass together.

Rollback: set ADSENSE_ENABLED=false and reload configuration/restart; inspect a fresh navigation. Previously loaded third-party SDKs and long-lived sessions require CMP-specific withdrawal/reload handling. Do not drop tables or change Telegram delivery for an advertising rollback. No GA4, paid analytics, Auto Ads code or ad-click tracking is required.

References: [AdSense policies](https://support.google.com/adsense/answer/48182), [Google certified CMP requirements](https://support.google.com/adsense/answer/13554116), [placement policies](https://support.google.com/adsense/answer/1346295).
