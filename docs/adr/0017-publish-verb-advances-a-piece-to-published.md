---
status: accepted
realizes: [ADR-0015]
relates: [ADR-0016]
---

# `publish_piece`: the first lifecycle-advance verb

The Fase-4 ops slice ([ADR-0015](0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md)) shipped
the Desk's planning verbs — `spawn_piece`, `slot_piece`, `deslot_piece`, `decline_piece`, `spawn_talk`,
`decline_talk` — and deliberately stopped at `slotted`: **no verb advances a Piece past it.** The ops
migration even wrote the stop down, leaving `slot`/`deslot`/`decline` unguarded *"while no verb reaches
in_production/published; add transition guards when the advance verbs land, not before."*

That moment is here. The monthly [Review](../../CONTEXT.md) (`/review`) computes the realized Flag/Side mix
and Cadence **over the month's `published` Pieces**; with no way to mark a Piece published, the first Review
would compute over an empty set. Marking a shipped Piece live is a missing rung in the core lifecycle, not
gold-plating. Because content-os writes **only through the RPC contract** (ADR-0015, and
[ADR-0016](0016-management-web-ui-writes-through-the-rpc-contract.md) for the console), this is a contract
change, not a UI-only one.

## Decisions

1. **One named verb — `publish_piece(id)`, state-only.** It sets `slotted → published`, keeping the calendar
   `publish_date` the Review reads. Named-intent, like `slot_piece`/`decline_piece`, **not** a generic
   `advance_piece(id, to_state)`: the house style is one verb per intent, and a generic state-setter would
   invite exactly the illegal jumps the guard (decision 2) exists to forbid.

2. **The first from-state guard.** The base ops verbs set `state` unconditionally — safe only while no state
   past `slotted` could occur. `publish_piece` makes `published` reachable, so it guards: publish **only from
   `slotted`** (a missing id raises "not found"; a wrong state raises "must be slotted"). This is the guard
   the ops migration deferred, landing **with the verb that first needs it**, rather than retrofitted onto
   verbs whose target states still cannot occur.

3. **The caller is the console, not the Desk.** Publishing records a *shipping fact* ("this went live"), not
   editorial planning — so it belongs to the **hands** (`content-os-web`, a "Mark shipped" tap on a slotted
   Piece), not the Desk **brain**, whose scope guard keeps it pre-publish ([ADR-0007](0007-desk-interactive-planning-surface.md)).
   The console calls the RPC directly via a Server Action (ADR-0016).

4. **No MCP-adapter tool yet (YAGNI).** No MCP consumer publishes: the Desk plans, the Review only reads. A
   `publish_piece` MCP tool now would be a verb with no caller. It stays additive-later if an AI-app door
   ever needs it — the same "MCP parity is a later step" the free-text edit verbs took.

5. **Scope stops at `published`.** `in_production` (Piece) and the Talk ladder (`in_production`/`ready`) get
   **no** verb here — nothing consumes them yet (the seeded Talks reached `ready` via the migration). Add
   them when a consumer appears, by the same rule that governed the deferred guards.

## Considered Options

- **A generic `advance_piece(id, to_state)`.** Rejected (decision 1): loose, invites illegal transitions,
  and can't carry a per-intent from-state guard cleanly. One verb per intent matches every existing verb.
- **Mark published from the Desk.** Rejected: it conflates planning with shipping and breaks the Desk's
  pre-publish scope guard. Shipping is hands-work; the console owns it.
- **Leave it a manual SQL `UPDATE`** (the design doc's prior status quo). Rejected: the Review needs it
  routinely, and Davide needs it from the phone; a raw `UPDATE` is precisely the second-source-of-truth path
  ADR-0015/0016 close.
- **Add the MCP tool too, for symmetry.** Rejected now (decision 4): a verb with no caller. Symmetry is not
  a requirement; a consumer is.

## Consequences

- **The RPC contract gains `publish_piece(text)`** (`supabase/migrations/…_publish_piece_verb.sql`: the
  `security definer` function + a `service_role`-only grant, same lockdown as the other privileged verbs).
  `docs/design/supabase-foundations.md`'s verb table gains the row, and its "advancing … is a plain state
  update" line narrows to `in_production`/Talk-`ready` only.
- **`content-os-web` gains** a `publishPiece` Server Action and a "Mark shipped" action on `slotted` Pieces
  (`docs/agents/web-console.md`). The `/review` can now compute over real `published` Pieces.
- **Follows the doc rule** (ADR-0015): CLAUDE.md and `docs/agents/*` track the code as this lands.
  **CONTEXT.md is unchanged** — this is the existing lifecycle gaining a verb, not new domain language.
- **Verified at the seam** (no unit tests): publishing a `slotted` Piece yields `published` and keeps its
  `publish_date`; publishing a `proposed`/already-`published` Piece raises; the console round-trips it and
  the "Mark shipped" control is absent on non-slotted Pieces.
