# The Pipeline is a three-tier model: Idea → Pieces → CFPs

The taxonomy modeled every content item as one issue on a single state ladder
(`idea → proposed → slotted → in-production → published`) carrying a single channel. Reality broke
that on two axes. First, **one Idea legitimately yields several outputs across channels** — a blog
post, a social amplifier, a talk — and each has its own timeline, publish date, state, and production
artifact; a single multi-labeled issue can hold only one state and one board Date, so it cannot
represent them. Second, **one Talk is submitted to many conferences over time**. We decided the
Pipeline is a **three-tier model of linked issues** on content-os:

- **Tier 1 — Idea:** the raw spark (ADR-0008 capture doors). Judged **accepted** or **rejected**; an
  accepted Idea **spawns Pieces** and stays open as their **umbrella** (the "one view" per theme).
- **Tier 2 — Piece:** one per channel output (blog / social / talk). Its own lifecycle
  (`proposed → slotted → in-production → published`), channel, publish date, and production artifact
  (in the Factory, referencing the Piece). Linked to its Idea; can **block** a sibling Piece.
- **Tier 3 — CFP:** a submission of a Talk Piece to one conference — its own deadline and outcome
  (to-submit / submitted / accepted / rejected). **One Talk → many CFPs**; the Talk stays put, each
  CFP adapts the pitch's tone.

The existing state ladder splits cleanly across the tiers: **`idea` is Tier-1**;
**`proposed / slotted / in-production / published` become the Piece lifecycle** — no new states invented.

## Considered Options

- **Parent Idea + child Pieces (+ CFPs under Talk Pieces)** (chosen): each output gets its own
  lifecycle, date, and artifact; the Idea is the umbrella that gives the per-theme "one view". Costs
  hierarchy (native sub-issues + a linking convention) and more issues — borne only when an Idea
  yields more than one output; a single-output Idea stays light.
- **One issue, multiple channel labels**: rejected — an issue has one state and one board Date, so
  independent per-channel timelines/states (the blog ships while the talk is still a CFP) cannot
  coexist on it.
- **Keep the single-ladder model**: rejected — it conflates the spark's judgment with a Piece's
  production, and can represent neither a multi-output Idea nor a multi-CFP Talk.

## Consequences

- **CONTEXT.md gains the term Piece** and revises **Idea** (accept/reject + umbrella) and **CFP**
  (one Talk → many). Extends ADR-0001 — all three tiers live on content-os.
- **Cadence is counted over Pieces**, never Ideas (1 blog Piece/month, 1 social Piece/week).
- **Slotting, production, and publishing all happen on Pieces**; an Idea is never slotted.
- **Blocking edges between Pieces** (e.g. a blog Piece blocks the social Piece amplifying it) use the
  tracker's native blocking links / sub-issues.
- **desk and the Monday Beat now judge Ideas into accept/reject and spawn Pieces** — an evolution of
  the Desk (ADR-0007) and the Monday Beat over the three tiers.
- **Execution, tracked separately:** `docs/agents/pipeline-taxonomy.md`, the issue templates, and the
  Calendar's `Stage` field must be reworked to the tiers — a sizable multi-step build, not done here.
