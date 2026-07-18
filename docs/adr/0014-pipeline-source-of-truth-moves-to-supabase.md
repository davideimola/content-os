---
status: accepted
supersedes: [ADR-0001, ADR-0002, ADR-0005, ADR-0008]
---

# The Pipeline's source of truth moves from GitHub to Supabase; API-first; Talk becomes a first-class type

The Pipeline lived as GitHub Issues + a Projects board on `davideimola/content-os` (ADR-0001). That
substrate turned out to be **structurally constraining**, not just awkward: the board `Stage` field
duplicates the state label (the same fact in two places, "label wins if they disagree"); the CFP body
is a markdown template hand-mirrored from `cfp.yml` and has already drifted (`#42`); sub-issues are
**single-parent**, so a three-level tier tree and any many-to-many are fought rather than modelled; and
there are no typed relations, enums, or computed views — cadence and the Flag mix are label-counting,
not queries. These are limits of the store, not of the modelling. We move the source of truth to a
**relational database (Supabase / Postgres)** and make the system **API-first**, so the store carries
the structure and every surface (CLI, skills, Factories, capture doors) talks to one contract. GitHub
stays the home for **code and ADRs**, not the Pipeline.

## Decisions

1. **Supabase (Postgres) is the single source of truth; the system is API-first.** The API contract —
   Supabase's auto-generated REST (PostgREST) plus **RPC (Postgres functions)** for atomic multi-step
   verbs (`accept_idea`, `create_cfp`, …) — is the center of the architecture: the store is swappable
   behind it and the front-end is additive on top of it. Cadence, Flag mix, and staleness become **SQL
   views** (`cadence`, `flag_mix`, `stale_ideas`), not label counts.

2. **Talk is split out of the Piece tier into its own type.** The tiers become **Idea → {Piece, Talk};
   Talk → CFP**. A **Piece** is a single dated output on a cadence channel (`blog`/`linkedin`),
   lifecycle `proposed → slotted → in_production → published`, with a publish date and a `blocked_by`
   self-reference; it feeds Cadence and the Flag mix. A **Talk** is a distinct, **dateless** editorial
   object (a brief + deck delivered 0..N times), lifecycle `proposed → in_production → ready` (no
   `published`); it carries a Flag/Side and counts toward the Flag mix but **not** Cadence. A **CFP** is
   a **child of a Talk** and carries the temporal state the Talk lacks — deadline, conference date, and
   outcome (`to submit / submitted / accepted / rejected`); one Talk → many CFPs. This resolves the
   single-date contradiction the old model hit when one talk is accepted at several conferences.

3. **Idea → output stays single-parent; synthesis is a merge, not a graph feature.** Each Piece/Talk
   has exactly one parent Idea. When several sparks are really one arc, the Desk **merges** them into one
   umbrella Idea (closing the others or citing them as sources) rather than modelling many-to-many. The
   database now makes N-M cheap (a junction table), so this is a **deliberate editorial choice**, not a
   substrate limitation: synthesis is judgement, and judgement lives in the Desk at the Idea tier.

4. **Metrics move into the database.** The monthly LinkedIn/site numbers become tables, so the same SQL
   views that compute Cadence and the Flag mix read them directly, instead of normalized files in the
   repo.

5. **The capture door — the crown jewel — is preserved at two trust levels.** Capture-from-anywhere in
   seconds must survive (it was free on GitHub via `gh` and vendor connectors). The **official Supabase
   MCP server** serves the **trusted/local** context (Claude Code, admin, `desk`) where broad access is
   fine and nothing needs building. A **narrow, insert-only `capture_idea` Edge Function** serves the
   **phone apps** (ChatGPT Custom GPT Action, MCP connectors on apps that support them) — least
   privilege, because that token lives in a third-party cloud and must never reach beyond inserting an
   Idea. This keeps ADR-0005's vendor-neutral spirit (any AI app with a custom action/connector can be
   the door); only the mechanism shifts from GitHub's connector to our own API.

6. **The other seams re-point at the API, not the shape.** The `contentos` CLI becomes an **API
   client**. The **Beats** stay GitHub Actions cron + `notify_ping` bash (ADR-0010/0009 hold); only
   their `detect` changes from `gh` to a `curl` on a Supabase view. The **Factories**
   (`davideimola.dev`, `presentations`) call the API contract — which is what finally kills the
   cross-repo drift that motivated this whole review (one contract, every repo calls it; no re-encoded
   `gh` shape, no hand-mirrored templates).

7. **The front-end is earned, not assumed.** Day one, Supabase's admin UI is the view. A bespoke
   Next.js app on Vercel (a real calendar/board/dashboard) is a **later slice**, built only when the
   admin UI stops being enough — API-first means it is purely additive.

## Considered Options

- **Stay on GitHub and model harder / add a CLI-as-API layer over `gh`.** Rejected: the pain points
  (Stage↔label duplication, single-parent sub-issues, hand-mirrored CFP schema, no typed relations or
  computed views) are **substrate limits**, and a CLI wrapper over `gh` inherits all of them. It would
  centralize the mechanics but not remove the structural ceiling.
- **Hand-build a Next.js + Postgres backend from scratch.** Rejected as the day-one move: it means
  building auth, API, and UI by hand for a single-user pipeline. Supabase provides DB + API + auth +
  admin UI immediately; the bespoke Next app is deferred until it earns its keep. (The instinct
  — Postgres + API + Next + CLI — is right; only "hand-roll the backend" is dropped.)
- **Hybrid: keep GitHub as the capture inbox, sync into a DB store.** Rejected as an end state — two
  sources of truth and a sync to keep honest. Acceptable only as a **transitional** dual-write during
  cutover, not as the target.

## Consequences

- **Supersedes ADR-0001** (Pipeline centralized on content-os Issues → now Supabase), **ADR-0002** (no
  app / no server → a managed, serverless backend; the original objection was to running and
  maintaining a box, which managed Supabase is not), **ADR-0005** (AI-app capture via a GitHub
  connector → via a Custom GPT Action / MCP against our API), and **ADR-0008** (the `/idea` skill files
  via `gh` → via the API). **Remaps ADR-0003/0004/0009**: `contentos` stops shelling out to `gh` for
  the Pipeline and calls the API instead; it stays the hands-only local surface.
- **A one-shot data migration** is required: export the existing issues (`gh issue list --json`),
  transform (notably remap talks from a `talk`-channel Piece to the new Talk type), and insert into
  Supabase, then cut over.
- **New operational surface**: hosting, auth, and backups now exist — largely absorbed by managed
  Supabase — plus a least-privilege capture token to guard. This is the deliberate cost paid for the
  structural flexibility.
- **Execution is a multi-slice build** (foundations → capture-door tracer bullet → reads → writes →
  data migration → front-end → decommission the GitHub Pipeline), not done in this ADR.
- **`CONTEXT.md` is updated** to reflect the split (Talk is no longer a kind of Piece) and to drop the
  implementation bindings that leaked into the glossary (GitHub Projects board, issues, repo-stored
  metrics).
