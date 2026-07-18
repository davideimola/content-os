---
status: accepted
supersedes: [ADR-0001, ADR-0002, ADR-0005, ADR-0008]
---

# The Pipeline's source of truth moves from GitHub to Supabase; API-first; Ideas become a live pool judged at the output

The Pipeline lived as GitHub Issues + a Projects board on `davideimola/content-os` (ADR-0001). That
substrate turned out to be **structurally constraining**, not just awkward: the board `Stage` field
duplicates the state label; the CFP body is a markdown template hand-mirrored from `cfp.yml` and has
already drifted (`#42`); sub-issues are **single-parent**, so a multi-level tier tree and any
many-to-many are fought rather than modelled; and there are no typed relations, enums, or computed
views — cadence and the Flag mix are label-counting. We move the source of truth to a **relational
database (Supabase / Postgres)** and make the system **API-first**, so the store carries the structure
and every surface (CLI, skills, Factories, capture doors, `davideimola.dev`) talks to one contract.
GitHub stays the home for **code and ADRs**, not the Pipeline.

The domain model was reworked in a grilling session (recorded below); the decisions here supersede
ADR-0011's Idea/Piece/CFP shape.

## Decisions

1. **Supabase (Postgres) is the single source of truth; the system is API-first.** The contract is
   Supabase's REST (PostgREST) plus **RPC (Postgres functions)** for atomic multi-step verbs
   (`capture_idea`, `spawn_piece`, `create_engagement`, …). Cadence, Flag mix, and staleness are **SQL
   views**. **Migrations are managed by the Supabase CLI** (`supabase/migrations/<ts>_*.sql`) — one tool
   for schema, RLS, and the Edge Functions the capture door needs; the up-only trade-off is acceptable
   for a solo project. IDs are **Stripe-style prefixed text** (`idea_…`, `piece_…`, `talk_…`, `eng_…`,
   `event_…`): legible by type and non-enumerable for the external capture endpoint.

2. **Ideas are a persistent pool; judgement happens on the output, never on the Idea.** An **Idea** is a
   raw spark that stays **`live`** by default (it may never be used, and is never "rejected"); it goes
   **`archived`** (reversible) only when a duplicate or genuinely repudiated. AI **correlation** over the
   live pool **proposes** outputs; a proposed Piece/Talk is **always persisted** (state `proposed`) so a
   later correlation round does not re-propose the same thing, and declining it sets state **`declined`**
   (kept on the record, not deleted). The accept/reject judgement thus lives on the **output** tier, not
   on the Idea (this reverses ADR-0011's "judge the Idea, accept spawns Pieces"). Whether correlation
   runs autonomously (a Beat) or in the Desk is left to the Beats work.

3. **The tiers are Idea → {Piece, Talk}; Talk → Engagement → Event.** A **Piece** is a single dated
   output on a cadence channel (`blog`/`linkedin`, a Postgres enum), lifecycle
   `proposed → slotted → in_production → published` (+ `declined`), with a publish date and a
   `blocked_by` self-reference; it feeds Cadence and the Flag mix. A **Talk** is a distinct, **dateless**
   editorial object (a brief + deck delivered 0..N times), lifecycle `proposed → in_production → ready`
   (+ `declined`, no `published`); it counts toward the Flag mix but **not** Cadence. **Idea → Piece and
   Idea → Talk are many-to-many** (junction tables `piece_sources` / `talk_sources`) — the pool is
   correlated into outputs, an Idea is not consumed and can feed several; this drops the `merge` concept
   (a duplicate Idea is just `archived`). Cadence and Flag mix are counted over Pieces (Cadence) and
   Pieces+Talks (Flag mix).

4. **Engagement replaces CFP as the Talk↔Event link.** An **Engagement** (`eng_…`) is one instance of a
   Talk taken to an Event, of **`kind` `cfp` or `direct`**: `cfp` carries the submission funnel
   (deadline, link, outcome `to_submit → submitted → accepted/rejected`); `direct` is a self-organized
   slot (outcome `confirmed`). One Talk → many Engagements; the accepted Engagement is the **single**
   talk↔event link (no `event.talk_id`), which handles multiple talks at one event for free. **CFP is now
   defined as an Engagement of kind `cfp`** ("engagement" is also the term used on `davideimola.dev`).

5. **Events are first-class; `davideimola.dev` reads a public view.** An **Event** (`event_…`) has dates,
   location, url, a **`roles` `text[]`** (organizer, mc, …; *speaking* is derived from an accepted
   Engagement, not a role), and an **`is_public`** flag. `davideimola.dev` populates its events page and
   calendar by reading a **`public_events` view** (public events + the accepted Engagement's talk title)
   through the `anon` role — never the base tables, which stay behind RLS, so pending/rejected
   submissions never leak. A Piece may optionally link an **`engagement_id`** (the accepted-talk
   announcement / recap), so that content need not be forced through an Idea.

6. **The capture door — the crown jewel — is preserved at two trust levels.** The **official Supabase
   MCP server** serves the trusted/local context (Claude Code, admin, `desk`). A narrow, **insert-only
   `capture_idea` Edge Function** serves the phone apps (ChatGPT Custom GPT Action, MCP connectors) —
   least privilege, because that token lives in a third-party cloud and must never reach beyond inserting
   an Idea. This keeps ADR-0005's vendor-neutral spirit; only the mechanism shifts from GitHub's
   connector to our own API.

7. **The other seams re-point at the API.** `contentos` becomes an **API client**. The **Beats** stay
   GitHub Actions cron + `notify_ping` bash (ADR-0010/0009 hold); their `detect` changes from `gh` to a
   `curl` on a Supabase view (staleness is now *untriaged proposals*, not *unjudged Ideas*). The
   **Factories** (`davideimola.dev`, `presentations`) call the API contract — killing the cross-repo
   drift that motivated this review. **Metrics move into the DB**: `metrics_site` is pulled from the
   **Umami API** (automatable), `metrics_linkedin_posts` from the manual export, both optionally linked to
   the Piece they measured.

8. **The front-end is earned, not assumed.** Day one, Supabase's admin UI is the view; a bespoke Next.js
   app on Vercel is a later slice, purely additive over the API.

## Considered Options

- **Stay on GitHub and model harder / add a CLI-as-API layer over `gh`.** Rejected: the pain points are
  substrate limits (Stage↔label duplication, single-parent sub-issues, hand-mirrored schema, no typed
  relations or views) that a `gh` wrapper inherits.
- **Hand-build a Next.js + Postgres backend from scratch.** Rejected as day one: Supabase gives DB + API
  + auth + admin UI immediately; the bespoke app is deferred until earned.
- **Single-parent Idea→output + `merge` for synthesis.** Rejected after grilling: Ideas are a *persistent
  correlated pool*, an Idea is reused across outputs and never consumed — that is inherently many-to-many,
  and `merge` would destroy the pool. Junction tables + `archived` are the right shape.
- **`dbmate` for migrations.** Rejected: it would own only the bare schema, and RLS + Edge Functions
  still need the Supabase CLI — two tools where one suffices.
- **Keep the entity named `CFP`.** Rejected once it also holds `direct` slots: renamed `engagement`
  (kind `cfp`/`direct`), aligning with the term already used on `davideimola.dev`.

## Consequences

- **Supersedes ADR-0001** (Pipeline on content-os Issues → Supabase), **ADR-0002** (no app/server → a
  managed serverless backend), **ADR-0005** (capture via GitHub connector → Custom GPT Action / MCP), and
  **ADR-0008** (`/idea` via `gh` → via the API). **Remaps ADR-0003/0004/0009**: `contentos` calls the API
  instead of shelling to `gh`; still the hands-only local surface.
- **A one-shot data migration** is required (export issues, remap talk-channel Pieces to the Talk type and
  CFPs to Engagements, insert into Supabase, cut over).
- **New operational surface** (hosting, auth, backups — absorbed by managed Supabase) plus a
  least-privilege capture token and a public read role to guard via RLS.
- **Execution is a multi-slice build** (foundations → capture-door tracer bullet → reads → writes → data
  migration → front-end → decommission the GitHub Pipeline), not done here. The concrete schema, RPC
  contract, views, and migration mapping live in
  [`docs/design/supabase-foundations.md`](../design/supabase-foundations.md).
- **`CONTEXT.md` is updated** to the reworked model.
