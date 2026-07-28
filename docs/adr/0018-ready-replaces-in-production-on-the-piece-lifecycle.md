---
status: accepted
amends: [ADR-0017]
relates: [ADR-0011, ADR-0014, ADR-0016]
---

# `ready` replaces `in_production` on the Piece lifecycle

The Piece lifecycle carried an intermediate state, `in_production`, since the init migration
([ADR-0014](0014-pipeline-source-of-truth-moves-to-supabase.md)): `proposed → slotted → in_production →
published`. It never earned its keep. **No verb ever set it** — the Fase-4 ops slice
([ADR-0015](0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md)) stopped at `slotted`, and
`publish_piece` ([ADR-0017](0017-publish-verb-advances-a-piece-to-published.md)) advances **`slotted →
published` directly, skipping it**. ADR-0017 dec.5 said so outright: "`in_production` … gets no verb here —
nothing consumes them yet." It was an unreachable enum value, and its only reader (the `cadence_status`
view) matched a state nothing could produce — dead code.

The name was also the wrong shape. `in_production` names a **process** ("being written"), and the truth of
"being written" already lives elsewhere — the Factory's open PR / branch. Replicating it as a Pipeline
label risks the very second-source-of-truth ADR-0014/0016 close. What the Pipeline *should* record is the
**milestone the PR does not express**: "this is written, in the can, awaiting its publish date" — the
observable of Davide's real workflow, which is to prepare content ahead in batches. That milestone is
`ready`, and it is **already in the vocabulary**: the Talk ladder uses `ready` with exactly this meaning
("prepared, awaiting the next step"). `in_production` on Pieces was the anomaly.

Unlike `in_production`, `ready` has a consumer **now**, not "when a Factory exists": a **"Mark ready" tap in
the console** — the exact twin of ADR-0017's "Mark shipped". Both `ready` and `published` are *shipping
facts* Davide's finger records, not states an automated process must manage.

## Decisions

1. **Rename, don't add — `in_production → ready` on `piece_state`.** One `ALTER TYPE piece_state RENAME
   VALUE` (no row migration — nothing was ever in that state). The Piece lifecycle becomes
   `proposed → slotted → ready → published` (+ `declined`). The Talk ladder is **unchanged**: Talks keep both
   `in_production` (slides being built) and `ready` (prepared) — a longer production process legitimately
   needs both; a blog/LinkedIn Piece does not, so one intermediate state is enough. Asymmetry is fine
   (ADR-0017 dec.4: symmetry is not a requirement).

2. **New verb `mark_ready(id)`, guarded `slotted → ready`.** The twin of `publish_piece`: a named-intent,
   from-state-guarded, `service_role`-only `security definer` function (a missing id raises "not found"; a
   wrong state raises "must be slotted"). It records the fact "prepared ahead", keeping the calendar
   `publish_date`.

3. **`publish_piece` widens to `{slotted, ready}`.** This **amends [ADR-0017](0017-publish-verb-advances-a-piece-to-published.md)
   dec.2**, whose slotted-only guard was correct while `ready` was unreachable. Now the batch path is
   `slotted → ready → published`, but a Piece written and shipped the same day may still go
   `slotted → published` directly — `ready` is a station on the line, not a tollgate. The verb stays
   from-state-guarded (it rejects `proposed`/already-`published`).

4. **The caller is the console (ADR-0016), not the Desk.** Marking ready records a *production fact*, not
   editorial planning — hands, not brain. The Desk's scope guard stays pre-`ready`
   ([ADR-0007](0007-desk-interactive-planning-surface.md)). The console gains a `markReady` Server Action
   and a "Mark ready" control on `slotted` Pieces; "Mark shipped" now shows on `slotted` **and** `ready`.

5. **No MCP-adapter tool yet (YAGNI).** Same as `publish_piece` (ADR-0017 dec.4): no MCP consumer marks a
   Piece ready. Additive-later if an AI-app door ever needs it.

6. **`cadence_status` counts `ready` as covered.** A `linkedin`/`blog` Piece dated in the window is *more*
   covered when `ready` (it's done) than when merely `slotted`. The view's `in_production` branches become
   `ready`.

## Considered Options

- **Keep `in_production`, add a verb for it later.** Rejected: it names a process whose truth lives in the
  PR, and by the deferred-guard rule its consumer (an automated Factory) still does not exist. `ready` has a
  console consumer today.
- **Add `ready` *alongside* `in_production`** (`proposed → slotted → in_production → ready → published`).
  Rejected for Pieces (YAGNI): a blog/LinkedIn Piece's writing is short; the useful, stable observable is
  "done, in the can", not "mid-write". One intermediate state earns its keep, two do not. (The Talk ladder
  is the case where both *do* — hence the retained asymmetry.)
- **`publish_piece` from `ready` only** (a mandatory station). Rejected: forces a `mark_ready` tap even when
  a Piece is written and shipped the same day. `{slotted, ready}` keeps the batch path without taxing the
  fast path (chosen with Davide).
- **A generic `set_piece_state(id, to)`.** Rejected for the same reason ADR-0017 dec.1 rejected
  `advance_piece`: loose, no per-intent guard, invites illegal jumps.

## Consequences

- **The RPC contract gains `mark_ready(text)`** and **`publish_piece` widens its guard**
  (`supabase/migrations/…_ready_state_and_mark_ready.sql`: the `ALTER TYPE` rename, the new
  `security definer` + `service_role`-only grant, the widened `publish_piece`, and a `cadence_status`
  rebuild). `docs/design/supabase-foundations.md`'s verb table and enum list track it.
- **`content-os-web` gains** a `markReady` Server Action and a "Mark ready" action on `slotted` Pieces;
  "Mark shipped" shows on `slotted`/`ready`; the lifecycle board's third column is **"Ready"**
  (`src/lib/pipeline.ts`, `src/lib/actions.ts`, `src/app/pipeline/page.tsx`,
  `src/components/pipeline.tsx`, `src/components/detail/piece-detail.tsx`).
  *(The lifecycle board was later **dissolved** — [ADR-0021](0021-console-computes-facts-not-judgement.md)
  decision 2 — so `src/app/pipeline/page.tsx` no longer exists; both actions live on the Piece drawer, which
  every view opens. The verbs and their guards are unchanged.)*
- **CONTEXT.md changes** — this *is* new domain language (`in-production` → `ready` on the Piece), unlike
  ADR-0017. The living agent docs (`CLAUDE.md`, `pipeline-taxonomy.md`, `web-console.md`, `thursday-beat.md`,
  the Desk skill) track the Piece-state rename; Talk-`in_production` references stay.
- **Known debt, not touched here:** `docs/agents/calendar.md` (and the mirroring line in `CLAUDE.md`) still
  document the GitHub Projects board's `Stage` options with hard-coded option-ids including `in-production`.
  That board predates the Supabase move (ADR-0014) and its recipe carries real ids; renaming the option is a
  board operation, not a doc edit, and is out of scope for this ADR.
- **Verified at the seam** (no unit tests): `mark_ready` on a `slotted` Piece yields `ready` and keeps its
  `publish_date`; on a `proposed`/`ready`/`published` Piece it raises; `publish_piece` now succeeds from
  both `slotted` and `ready` and still rejects `proposed`; the console round-trips
  `slot → mark ready → mark shipped`; `cadence_status` reports a `ready` Piece dated this week as covered.
