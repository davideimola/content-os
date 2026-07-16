# LinkedIn Personal Post Analytics via Official APIs (2026)

> Research date: 2026-07-16. All claims below are sourced exclusively from LinkedIn's official API
> documentation on `learn.microsoft.com/linkedin` (the docs' own canonical URLs are cited per claim).
> No secondary sources were used for factual claims.
>
> **Location note:** this repo keeps agent-facing docs under `docs/` and had no research convention
> yet, so `docs/research/` was created as the home for research notes like this one.

## TL;DR verdict

**The API exists and covers exactly what we want — but self-serve access to it does not exist for a
private individual. Feasibility hinges entirely on passing LinkedIn's business vetting.**

1. **The right product is the Community Management API** (versioned Marketing `li-lms` APIs). Its
   "Members" endpoints — `memberCreatorPostAnalytics` (per-post and aggregated impressions, unique
   members reached, reactions, comments, reshares, saves, link clicks, followers gained per post,
   daily time series) and `memberFollowersCount` (lifetime + daily follower counts) — return the
   authenticated member's **own** analytics under the scopes `r_member_postAnalytics` and
   `r_member_profileAnalytics`. This is precisely the "personal post analytics" data we want.
2. **The hard gate:** the docs state the Community Management APIs are *"only available to
   registered legal organizations for commercial use cases only"* and *"Personal email addresses
   won't pass the vetting process."* An individual with a personal app and no legal entity does
   **not** meet the documented criteria. An individual with a registered business (e.g., an Italian
   sole proprietorship with VAT number, a business email on its own domain, a website, and a privacy
   policy) plausibly does — but approval is a discretionary LinkedIn review whose outcome cannot be
   guaranteed from the docs.
3. **The self-serve alternative (DMA Member Data Portability, EEA-only) does NOT contain analytics.**
   It is genuinely self-serve and free for an EU resident, but its Snapshot/Changelog APIs export
   member-*generated* data (posts, comments, profile, messages...). No snapshot domain includes
   impressions, reach, or any post-performance metric.
4. **Unattended automation is constrained by tokens:** all access tokens live 60 days; programmatic
   refresh tokens are reserved for *"approved Marketing Developer Platform (MDP) partners"*. A
   monthly cron can reuse one token for two cycles, but someone must re-run the (browser-based)
   OAuth flow at least every 60 days unless the app is an approved MDP partner.
5. **Cost:** no fee is documented anywhere for any of these products (application, access, or
   usage). Rate limits are the only quota: Community Management **Development tier = 500 calls/app/day
   and 100 calls/member/day**, which fits a monthly pull of 10–30 posts only if you limit
   metrics-per-post or spread calls over 2–4 days.

**Bottom line for a solo EU creator:** feasible at zero monetary cost *only if* you can apply as (or
through) a registered legal organization and LinkedIn approves the use case; the Development tier's
quotas are technically sufficient for personal-scale monthly ingestion, but it is contractually a
12-month build-and-test tier, and long-term production use requires a Standard-tier review (screen
recording, test credentials). Without a legal entity, there is **no documented official path** to
programmatic personal post analytics in 2026.

---

## 1. Member Post Statistics — `memberCreatorPostAnalytics` (Community Management API)

Source: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics?view=li-lms-2026-06>

- *"The `memberCreatorPostAnalytics` API retrieves both single post or aggregated posts analytics
  for the authenticated member."* Two finders:
  - `q=entity` — stats for one post (`entity` is a `urn:li:ugcPost:...` or `urn:li:share:...` URN);
  - `q=me` — aggregated stats across **all** of the member's posts.
- **Permission:** `r_member_postAnalytics` — *"Retrieve your posts and their reporting data."*
- **Metrics** (API versions `202604`–`202607`; earlier versions from `202508` have only the first
  five):
  `IMPRESSION`, `MEMBERS_REACHED` (defined as *"post viewers or unique impressions count metric"*),
  `RESHARE`, `REACTION`, `COMMENT`, `POST_SAVE`, `POST_SEND`, `LINK_CLICKS`, `PREMIUM_CTA_CLICKS`,
  `FOLLOWER_GAINED_FROM_CONTENT`, `PROFILE_VIEW_FROM_CONTENT`.
- **Time series:** `aggregation=DAILY` returns per-day data points; `TOTAL` (default) returns one
  number. Caveats stated in the doc:
  - DAILY is **not** supported for `MEMBERS_REACHED`, `LINK_CLICKS`, `FOLLOWER_GAINED_FROM_CONTENT`,
    `PROFILE_VIEW_FROM_CONTENT`;
  - *"Daily impression metrics are not supported if given entity is post"* (i.e., per-post daily
    impressions are unavailable; use TOTAL per post, DAILY only account-wide);
  - `dateRange` optional — omitted = lifetime of the post.
- **One metric per call** (`queryType` takes a single value) — relevant for rate-limit budgeting.
- Endpoint: `GET https://api.linkedin.com/rest/memberCreatorPostAnalytics` with
  `Linkedin-Version: YYYYMM` and Rest.li 2.0 protocol headers.
- Accuracy caveats in the doc: counts are *"best-effort accurate and shouldn't be used for billing
  purposes"*; for `q=me`, *"RESHARE, REACTION, COMMENT are not consistent with UI at the moment."*

**What the docs say vs. what needs approval:** the endpoint documentation is complete and public,
but calling it requires an app provisioned with the Community Management API product (see §4) —
there is no self-serve grant of `r_member_postAnalytics`.

## 2. Member Follower Statistics — `memberFollowersCount` (follower growth)

Source: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/follower-statistics?view=li-lms-2026-06>

- *"The `memberFollowersCount` API retrieves both lifetime and time-bound follower statistics for
  the authenticated member."*
  - `q=me` → lifetime follower count;
  - `q=dateRange` → **daily** follower counts within the range (i.e., follower-growth series).
- **Permission:** `r_member_profileAnalytics` — *"Retrieve your profile analytics, including the
  number of profile viewers, followers, and search appearances. Restricted to members."*
- Endpoint: `GET https://api.linkedin.com/rest/memberFollowersCount` (versioned).
- Version availability per the permissions table (§4): `r_member_profileAnalytics` is *"supported
  only in API versions starting from 202504"*; `q=me` from `202504` and `q=dateRange` from `202505`.

A sibling **Member Video Statistics** endpoint (`memberCreatorVideoAnalytics`) also exists for video
posts: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/video-statistics?view=li-lms-2025-11>
(not examined in depth here).

## 3. Which product grants these scopes, and the tiers

Source: <https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-06>

- The permissions table lists under **Community Management API**:
  *"`r_member_profileAnalytics` (supported only in API versions starting from 202504)"* and
  *"`r_member_postAnalytics` (supported only in API versions starting from 202506)"*.
- *"Community Management API — Available to all developers approved for Community Management API
  access."* ("All developers" = all *approved* developers; approval process in §4.)
- **Tiers** (all apps start in Development; Standard requires a separate application):
  - **Development tier:** *"**500** API calls for an app for **24** hrs; **100** API calls per member
    of an App for **24** hrs; All APIs with BATCH_GET: No API calls allowed"* and *"Developers are
    expected to build core business use cases ... within twelve (12) months of the provisioning."*
  - **Standard tier:** *"No restrictions."*
- *"LinkedIn reserves the right to review applications and select partners at its discretion and a
  partner might not be upgraded even if they meet these minimum requirements."*

**Rate-limit math for our use case** (monthly, 10–30 posts, own member token): one call per post per
metric. 30 posts x 11 metrics = 330 calls → under the 500/day app cap but **over the 100/day
member cap**; 30 posts x 3 key metrics (IMPRESSION, MEMBERS_REACHED, REACTION) = 90 calls → fits in
one day. Full metric coverage would need the pull spread across 2–4 days. Generic rate-limit
mechanics (24h windows, UTC reset, 429 on breach, actual per-endpoint numbers visible only in the
Developer Portal Analytics tab): <https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits>.

## 4. Access process for the Community Management API — the real hurdle

Source: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review?view=li-lms-2026-06>

- *"To access the Community Management APIs, every developer must complete an access request
  form(s) which LinkedIn will review..."* — there is **no self-serve activation**.
- Eligibility, quoted verbatim:
  - *"At this time, our Community Management APIs are only available to **registered legal
    organizations for commercial use cases only**."*
  - *"Be prepared to share your **business email address** and your organization's **legal name,
    registered address, website, and privacy policy**. ... **Personal email addresses won't pass the
    vetting process.**"*
  - The app must be **verified by a super admin of the organization's LinkedIn Page**.
- Development-tier review checks: *"Approved use case; Verified business email address; Verified
  organization; Verified organization website and domain address; Application verified by LinkedIn
  Page associated with same organization."*
- If rejected: *"You won't be able to re-apply for Development tier access with your existing app"*
  (a new app + new form is required).
- **Standard tier** additionally requires: the Standard access form, *"a screen recording of your
  app"* demonstrating each declared use case via the full OAuth flow, and *"test credentials for our
  reviewers"*. Notably, the enumerated use-case categories include **"Executive Management"** and
  **"Employee Advocacy"** — both centered on *members posting to their own profiles* and viewing
  engagement — which are the closest sanctioned use cases to personal-creator analytics.
- Application steps (LinkedIn Page → developer app → apply under Products tab → access form):
  <https://learn.microsoft.com/en-us/linkedin/marketing/quick-start?view=li-lms-2026-06>.

**Docs-say vs. approval-uncertain:** the documented *criteria* are objective (legal org, domain
email, website, privacy policy, verified Page), but the *decision* is a discretionary LinkedIn
review of "approved use case" — the docs give no guarantee an individual's registered
sole-proprietorship with a personal-analytics use case would be accepted.

## 5. Member Data Portability (Member) — the DMA self-serve product (EEA)

Source: <https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/>

- Purpose: *"...provides APIs that allow LinkedIn members to create an application to fetch **that
  LinkedIn member's** LinkedIn data"* (DMA compliance product).
- **Genuinely self-serve:** create the dev app **using LinkedIn's dedicated default Company Page**
  (*"Member Data Portability (Member) Default Company"* — the docs explicitly say not to create your
  own Page for this), then *"Once you agree to the associated Terms and Conditions, your application
  would be granted access"*. No review, no business verification.
- **Geographic restriction:** *"this feature is available only for LinkedIn members located in the
  European Economic Area and Switzerland"* — fine for an Italian resident.
- **Token:** generated via the Developer Portal **OAuth Token Generator Tool** with scope
  `r_dma_portability_self_serve` (a manual, browser-based step).
- **Cost:** none stated anywhere in the product docs.
- Includes two APIs (shared with the 3rd-party variant):
  - **Member Snapshot API** — `GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria`,
    pinned to `Linkedin-Version: 202312` (other versions fail with `426 NONEXISTENT_VERSION`);
    scopes `r_dma_portability_member` / `r_dma_portability_3rd_party`; paginated:
    <https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/shared/member-snapshot-api>
  - **Member Changelog API** — `GET https://api.linkedin.com/rest/memberChangeLogs?q=memberAndApplication`;
    only events **after consent**, retained **28 days**; recommended `count=10` (max 50) and hourly
    polling: <https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/shared/member-changelog-api>

### Does any snapshot domain contain analytics? **No.**

Source (full domain list): <https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/shared/snapshot-domain>

The ~65 documented domains cover profile, activity, and account data. The post-related domains are:

- `MEMBER_SHARE_INFO` — *"Contains all shared or re-shared posts, including date, URL, shared
  comments, and visibility status."* → post inventory, **no impressions/reach/engagement counts**.
- `ALL_COMMENTS`, `ALL_LIKES`, `ALL_VOTES`, `INSTANT_REPOSTS`, `ARTICLES`, `RICH_MEDIA` — the
  member's own comments/reactions/reposts/articles/media, i.e., actions *by* the member, not
  metrics *about* the member's posts.
- `MEMBER_FOLLOWING` / `COMPANY_FOLLOWS` are who *the member* follows — there is **no domain for the
  member's own follower count or follower history**.

No domain mentions impressions, views, reach, or statistics of any kind. The Changelog API likewise
captures *"the member's interactions (posts created, comments, reactions etc)"* — activity events,
not performance metrics.

## 6. Member Data Portability (3rd Party) — not a loophole

Source: <https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-3rd-party/?view=li-dma-data-portability-2026-05>

- Same Snapshot/Changelog APIs (so still **no analytics**), but lets an app fetch *other consenting
  members'* data, with standard 3-legged OAuth (scope `r_dma_portability_3rd_party`).
- Access requires a review form **plus business verification**: *"you must provide your business
  email address and organization's legal name, registered address, website, and privacy policy. ...
  Personal email addresses will not pass the business verification process."*
- *"Only LinkedIn users from the European Economic Area are allowed to consent to share their
  LinkedIn data with 3rd party developer applications."*

## 7. OAuth mechanics and unattended monthly automation

Sources:
<https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow> ·
<https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens> ·
<https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access>

- All member scopes here are **3-legged OAuth** (member consent in a browser). *"Currently, all
  access tokens are issued with a **60-day** lifespan."*
- Standard "refresh" is just re-running the auth flow; the consent screen is bypassed (but a browser
  redirect still happens) *"provided ... the member is still logged into linkedin.com [and] the
  member's current access token has not expired."*
- **Programmatic refresh tokens** (true unattended renewal): *"LinkedIn supports programmatic
  refresh tokens for **all approved Marketing Developer Platform (MDP) partners**."* Where enabled:
  access token 60 days, refresh token 365 days, after which *"the member must reauthorize your
  application."* Whether a Development/Standard-tier Community Management app receives
  `refresh_token` in practice is **not stated** in the docs (see Open questions).
- The Developer Portal also offers a manual **Token Generator** tool (used as the *only* documented
  token path for the DMA Member product), plus a Token Inspector for checking TTLs
  (<https://learn.microsoft.com/en-us/linkedin/marketing/quick-start?view=li-lms-2026-06>, Step 7).
- The general permissions overview confirms only three "Open Permissions" are grantable without
  approval (`profile`, `email` via OpenID Connect, and `w_member_social` for posting) — **no
  analytics scope is open**: <https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access>.

**Practical consequence for a monthly cron:** with 60-day tokens, one interactive login covers two
monthly runs; a fully hands-off pipeline needs either MDP-partner programmatic refresh or an
accepted ~bi-monthly human re-auth step (a single browser click if still logged in to LinkedIn).

## 8. Cost summary

- **No fees are documented** for the Community Management API (either tier), the Member Data
  Portability products, or any endpoint above — the only documented constraints are vetting and
  rate limits (all URLs cited in §3–§6). LinkedIn's docs never mention pricing for these products.

---

## Feasibility assessment for the stated goal

Goal: automated monthly ingestion of own-profile post analytics (impressions, engagement, follower
growth), EU-resident individual, ~10–30 posts/month, near-zero cost.

| Route | Analytics data? | Individual can get it? | Automation-ready? | Cost |
| --- | --- | --- | --- | --- |
| Community Management API (`memberCreatorPostAnalytics` + `memberFollowersCount`) | **Yes — exactly the target data** | **Only via a registered legal organization + LinkedIn review** (personal apps/emails explicitly excluded) | Yes, within Dev-tier quotas; token renewal every ≤60 days (programmatic refresh = MDP partners only) | Free per docs |
| Member Data Portability (Member) — DMA | **No** (content & activity only, no metrics) | Yes — true self-serve for EEA/CH members | Snapshot pinned to v202312; token via manual generator tool | Free per docs |
| Member Data Portability (3rd Party) | **No** | No — business verification required | n/a | Free per docs |
| Open Permissions (OpenID + Share) | **No** | Yes | n/a | Free |

**Verdict:** for an individual without a legal entity, there is no officially documented way to
pull own post impressions programmatically in 2026. The realistic paths are (a) apply to the
Community Management API through a registered business you control or are associated with (business
email + website + privacy policy + Page super-admin verification), accepting that approval is
discretionary; or (b) keep analytics ingestion manual (LinkedIn UI) and use the free self-serve DMA
product only for the content/inventory side of the pipeline.

## Open questions / what I could not verify

1. **Would LinkedIn approve a solo/registered-sole-proprietor use case?** The docs define criteria
   ("registered legal organizations", "commercial use cases") but the review is discretionary; no
   published acceptance statistics or examples exist in the official docs. Outcome uncertain by
   design.
2. **Does a Community Management (Development or Standard) app receive OAuth `refresh_token`s?**
   The programmatic-refresh doc says "approved Marketing Developer Platform (MDP) partners" without
   defining whether ordinary Community Management approval qualifies. Only observable by inspecting
   an actual token response after approval.
3. **Whether the Development tier may be used indefinitely for a personal integration.** The docs
   frame it as a build-and-test tier with a 12-month expectation, but do not document enforcement
   (expiry/revocation) behavior.
4. **Exact per-endpoint rate limits** for `memberCreatorPostAnalytics`/`memberFollowersCount`:
   *"Standard rate limits are not published in documentation"* — visible only in the app's Developer
   Portal Analytics tab after making calls
   (<https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits>).
5. **Historical backfill depth** of `memberCreatorPostAnalytics` (how far back `dateRange` can
   reach, and whether analytics exist for posts published before consent) — not stated in the doc.
6. **Whether the DMA (Member) product's token can be obtained via a normal coded 3-legged flow**
   rather than the portal's Token Generator tool — the product page documents only the generator
   tool for the `r_dma_portability_self_serve` scope.
7. **Non-API alternative not investigated here:** LinkedIn's in-UI creator analytics export
   (XLSX download) and the GDPR "Get a copy of your data" archive are consumer features outside the
   developer docs; their content/automatability was not verified against a primary source.
