# Phase 9 — Monetization readiness (ads OFF)

Base: `main` commit `91d206c440fc0df43eb07ffdb234a2b4cd832402` after Phase 8 PR #52. Branch: `agent/phase9-monetization-readiness`.

This phase prepares verification, page reviews, manual inventory and a consent boundary. It does **not** prove Google approval, certify a CMP, review the production catalog, activate advertising, apply production migrations or deploy. Telegram delivery, server-enforced 20-second countdown and redeem/303 handoff are unchanged. `DIRECT_DOWNLOADS_ENABLED=false` remains the default.

## Verification vs serving

| Setting | Meaning | Default |
| --- | --- | --- |
| `ADSENSE_PUBLISHER_ID` | Exact ASCII `ca-pub-` + 16 digits; public account identity when configured | empty |
| `ADSENSE_CONTENT_REVIEWED` | Operator attests catalog and linked destinations were reviewed | false |
| `ADSENSE_SITE_APPROVED` | Operator attests Google site status is actually Ready | false |
| `ADSENSE_PRIVACY_READY` | Operator attests certified CMP, notices and preference controls are complete | false |
| `ADSENSE_ENABLED` | Final serving switch; never set during this preparation | false |
| `ADSENSE_DETAIL_SLOT_ID` | 10-digit manual slot selected in owner's AdSense account | empty |
| `ADSENSE_CMP_ID` | Expected TCF CMP ID of chosen Google-certified web CMP | empty |

The first five gates must all pass. Missing or invalid values deny advertising. The manual slot and CMP ID must also be configured before the placement is mounted. Operator attestations do not query or validate Google's account status.

A valid publisher ID independently produces `google-adsense-account` metadata and `/ads.txt`, without the advertising SDK. `/ads.txt` is dynamic and returns 404/no-store for an absent or invalid ID and plain text/200 with a five-minute cache for a valid one. Google requires `pub-…` as the seller ID in ads.txt; `ca-pub-…` is used for ad client/meta. The supplied example was corrected to Google's documented format [1]. No real publisher ID is in code or examples. All-zero values exist solely in local, network-isolated fixtures.

## Owner review authority

Explicitly apply `migrations/005_monetization.sql` only after separately authorized rollout review. It requires migration 002's catalog revision. This migration is **not** wired into startup, runtime requests, or `migrate:release`.

`site_ad_eligibility` stores status (`unreviewed`, `eligible`, `blocked`), rights basis, internal notes, review time/owner, reviewed catalog revision and an independent review revision. Missing rows mean unreviewed; there is no default safe backfill. Monetization writes do not update `applications` or its revision.

`GET /api/admin/monetization` supports keyset pagination (1–100 items, UI pages of 50), aggregate counts and read-only gate state. `GET/PUT /api/admin/monetization/{application_id}` reads/updates one review. PUT requires exactly `expected_revision`, `status`, `rights_basis`, `review_notes`, an existing owner session, same-origin headers and a session-bound CSRF token. Body limit: 6144 bytes; note limit: 1000 characters. No statistics-token bypass, mass assignment, DDL, provider calls or environment switches.

Eligibility requires a known rights basis plus a written evidence note. This is an owner's review, **not an automatic license determination**. “Official”, “freeware” or “open source” alone does not guarantee redistribution permission or policy compliance. Review the license, dependencies/assets, modified code, distribution permission, source/download channel and landing-page behavior. Include a source or permission reference in the internal note. Do not insert credentials or private identity documents.

Writes lock the catalog row first and compare a hash of both catalog and review revisions; stale tabs receive 409 without automatic retry. An application/source change withdraws an eligible review via trigger and increments only its review revision. Counter updates do not invalidate reviews. Public eligibility also verifies the review matches the current catalog revision, active/published state and evidence. Missing schema/DB outage denies ads without attempting repair. Public rendering receives only a boolean/configuration; owner notes never enter public catalog responses, metadata or HTML.

## Manual placement and consent

There is **no global advertising SDK** in the root layout and no Auto Ads enabling call. Only the bottom of canonical app/game detail pages may mount one manual rectangle, after editorial content and related content, with an explicit “إعلان” label and spacing from other content. Pages with less than 200 description characters do not mount inventory; this is a placement-density guard, not a policy/quality judgment. Google has no approval guarantee based on that threshold.

The sticky mobile download bar is suppressed for an eligible advertising candidate so it cannot overlap the ad. Header download controls remain. Download/countdown/redeem, admin, account, auth, search, category/listing, legal and home routes do not mount the SDK or inventory. CSP's advertising origins are limited to configured canonical detail routes; forbidden routes retain Phase 8's restrictive policy. No click listeners, click analytics, refresh loops, incentives or download-gated ad viewing.

`ManualAd` subscribes to the configured CMP's standard `__tcfapi('addEventListener', 2, …)`. SDK loading waits for successful `tcloaded`/`useractioncomplete`, a loaded CMP with the expected ID, a nonempty TC string, explicit Google vendor 755 consent and purposes 1/3/4, with no publisher restriction for those purposes. This implementation conservatively requires affirmative consent globally. It does not implement non-personalized or limited-ad fallback. Missing/stub/failed CMP, unanswered callback, denial or wrong CMP ID means no SDK request. Revocation unmounts inventory and prevents new slot pushes; a loaded third-party SDK cannot be undone by removing React markup, so verify the selected CMP's withdrawal behavior and reload flow during account-specific staging.

**CMP account integration remains an operator prerequisite.** This phase does not install a self-made banner or claim it is certified. Once the owner chooses a currently Google-certified web CMP, integrate its documented bootstrap and preference/withdrawal controls, verify its TCF ID and current Google certification, confirm it generates TCF v2.3 strings (Google's mandatory requirement for new strings since 2026-03-01 [6]), and allow only the provider's necessary origins in CSP. Do not weaken CSP to `https:` or `unsafe-inline` for scripts. Google's CMP can be evaluated in the account's Privacy & messaging area; its account-specific configuration must be completed separately. Until this is implemented and verified, `ADSENSE_PRIVACY_READY=false` and ads remain OFF. Google requires a certified TCF CMP for personalized ads to EEA/UK/Switzerland traffic [2]; certification is not a blanket legal-compliance guarantee.

The owner must also turn **Auto Ads off in the AdSense account**. Merely using manual slot markup cannot override an account-side Auto Ads setting. Existing ad/third-party behavior must be tested in a separately authorized staging session before serving to users. CSP currently lists narrow Google advertising origins; expand an exact necessary origin only after observing/verifying the provider requirement, not speculatively.

## Privacy and analytics

The Arabic privacy page reflects the current environment's serving gates, describes Google advertising data use conditionally, links Google's partner-data explanation, and states that denying ads does not block downloads. Update controller/contact details and actual CMP controls before launch. Existing first-party daily pseudonymous visitor counting is unchanged; no GA4, Google Tag Manager, extra cookies, user-level marketing IDs or AdSense click tracking were added. Review existing visit retention and hosting logs against actual jurisdictions separately; hashing an IP-derived value does not establish anonymity or exempt it from privacy requirements.

## Owner launch sequence (future, not performed)

1. Establish a legitimate AdSense account with accurate identity, country, address, payment/tax details and service availability. Do not impersonate another publisher. Complete Google's required verification in Google.
2. Audit the entire visible catalog and linked file/destination content, redistribution rights and Google publisher policies [3]. Block/remove problematic listings; adding a review flag does not legalize content or assure site-wide approval.
3. Authorize/apply migration 005 in an appropriate staging environment first, then review individual pages in `/admin#monetization`. Document evidence; leave uncertain entries unreviewed/blocked.
4. Add the canonical site to Google and configure its valid publisher ID when actually available. Check meta and ads.txt; leave every serving flag false. Do not add the advertising SDK just for verification.
5. Integrate and test a current certified CMP, preferences/withdrawal and the final privacy notice; verify denial/unknown consent sends no SDK requests, CSP and route exclusions. Only then attest privacy readiness.
6. Receive real Google site approval/Ready; independently attest content review and site approval. Google may reject a site despite technically correct integration.
7. Create a manual slot, configure its ID and CMP ID, disable Auto Ads in the account and inspect layouts at 360/768/1440. Follow Google's placement rules, especially near navigation/download controls and countdowns [4].
8. Enable serving only in a separately authorized release after all review/security/browser checks pass. This phase does not flip production switches.

Rollback: set `ADSENSE_ENABLED=false` to stop new serving immediately after configuration reload/restart; publisher verification can remain available. Block a page through the owner's review to deny subsequent rendering. Long-lived browser sessions/previously loaded third-party scripts require a fresh navigation to pick up changed deployment flags. Do not drop migration tables or change the Telegram delivery flow as an advertising rollback.

## Verification

- Added real handler + isolated PostgreSQL (PGlite) tests for owner authorization, session-CSRF binding, origin rejection, body and field validation, unsafe rights claims, pagination, revision conflicts, state changes, catalog/source invalidation, counter preservation, missing tables and outage failure.
- Tested all 32 publisher/gate combinations, malformed IDs/flags, correct ads.txt format, manual configuration requirements, route-scoped CSP and consent grant/deny/failure/revocation decisions.
- `npm run typecheck`, `npm run lint`, `npm run build`, compiled client-secret scan and full regression suite are release checks; actual results are recorded in the PR.
- Added browser fixture checks to existing `scripts/test-admin-ui.mjs`: 360/768/1440 layouts, owner review transitions, stale/unavailable states, labels/axe, and a consent fixture that intercepts the SDK entirely. No requests reach Google.
- Local Chromium installation is unavailable in this workspace (download returned an invalid archive). Browser proof must come from CI; do not treat browser checks as passed until the CI job completes.
- Account-specific CMP/real ads/certification, production catalog audit, migration/deployment and AdSense submission were not performed.

## Official references (checked 2026-10-03)

1. [Google AdSense — ads.txt guide](https://support.google.com/adsense/answer/12171612?hl=en)
2. [Google — certified CMP requirements and current provider list](https://support.google.com/adsense/answer/13554116?hl=en)
3. [AdSense Program policies](https://support.google.com/adsense/answer/48182?hl=en) and [Google Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938?hl=en)
4. [Google AdSense — ad placement policies](https://support.google.com/adsense/answer/1346295?hl=en)
5. [Google — partner sites and data use](https://policies.google.com/technologies/partner-sites)
6. [Google — TCF publisher integration and v2.3 transition](https://support.google.com/adsense/answer/9804260?hl=en)
