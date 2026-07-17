# The Desk: interactive planning as a second brain over the Beats' hands

content-os plans the week two ways now. The Monday
[Beat](../../CONTEXT.md) runs autonomously on a schedule — Gemini decides,
unattended, and pings Davide because he is absent. The **[Desk](../../CONTEXT.md)**
is its interactive counterpart: an on-demand session Davide opens himself to work
the [Pipeline](../../CONTEXT.md) by hand, in the loop. Both drive the *same*
editorial judgement ([monday-beat.md](../agents/monday-beat.md)) and the *same*
deterministic hands; only the brain differs — Gemini for the unattended Beat,
Claude + Davide for the Desk. This is [ADR-0003](0003-contentos-cli-operations-surface.md)'s
hands/brain split taken to its conclusion: **the brain is swappable, the hands are
shared.**

Mechanically, each Beat runner is separated **GATHER → DECIDE → APPLY**. The Desk
reuses **GATHER** (`scripts/beats/monday.sh gather` → the identical state JSON) and
**APPLY** (the deterministic hands in `scripts/beats/lib.sh`), and *replaces*
**DECIDE**: it never calls `monday.sh decide` (the Gemini path). The judgement is
the conversation; the writes land in one batch when Davide approves the plan.

## Considered options

- **A standalone interactive skill, independent of the Beat code** (rejected): its
  own `gh` queries and its own writes, not touching `scripts/beats/`. Rejected
  because it duplicates the deterministic hands — two places that slot, two to keep
  in step — and re-encodes the editorial judgement, inviting drift from
  `monday-beat.md`.
- **A full editorial desk over the whole Pipeline** (rejected): one interactive
  surface for every operation — plan, cadence guard, monthly review, CFP,
  advancement to in-production/published. Rejected as an unbounded blob; the
  Thursday and Monthly Beats already own their arcs, and a planning-spined Desk
  keeps the first slice focused and shippable.
- **Incremental writes as each move is decided** (rejected): apply-and-show, one
  move at a time. Rejected for scattering writes through the session and nagging
  for per-move approval; a single approval gate keeps exploration free (it is only
  talk until "go") and reuses the Beat's `apply` code path in one shot.
- **The Desk — reuse GATHER + APPLY, swap DECIDE to Claude, planning spine, one
  gate** (chosen): the interactive counterpart to the Monday Beat. Its verbs are
  the Monday arc (`promote` / `hold` / `drop` / `slot`) plus `reslot` and `de-slot`;
  advancement and the CFP lifecycle stay out. No Telegram ping by default — Davide
  is present — with opt-in to archive the plan to the phone. Verified by driving it
  on a seeded Pipeline at the tracker seam, like the Beats.

## Consequences

- content-os gains its first `.claude/` directory: the Desk lives as a **project
  skill** at `.claude/skills/desk/`, versioned with the system it works.
- The Desk is **not a Beat** — a distinct term in [CONTEXT.md](../../CONTEXT.md)
  (interactive/present vs scheduled/absent). Do not call it "the interactive Beat".
- **One brain, two readers.** `docs/agents/monday-beat.md` is read at runtime by
  both the Gemini Beat and the Desk; changing the judgement changes both. The Desk
  skill must never copy the editorial signal framework — it points at the doc.
- `de-slot` gets **one meaning** across Beat and Desk — off the week *and* excluded
  from the automatic [Recycle](../../CONTEXT.md)
  ([ADR-0006](0006-dry-pipeline-recycle-and-prompt-never-generate.md)) — now that
  `reslot` carries "keep it, move the date". `de-slot` needs a new deterministic
  hand (`deslot_issue` in `lib.sh`, beside `slot_issue`); `reslot` reuses
  `slot_issue`.
- **Known gap, unchanged by this ADR:** ADR-0006's recycle-exclusion is not yet
  wired into the Beats' `gather` (no de-slot signal in the state JSON). Surfaced
  here, not fixed in this slice.
- Never drafts content ([ADR-0002](0002-no-app-repo-plus-claude-routines.md)): the
  Desk judges and routes; the Factories write.
