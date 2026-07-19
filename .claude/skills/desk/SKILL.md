---
name: desk
description: Open the Desk — an interactive, on-demand editorial planning session over the Content OS Pipeline. Correlate the live Idea pool into proposed Pieces/Talks, judge the current proposals (pursue → slot, or decline), archive duplicate/repudiated Ideas, decide whether a blog earns a LinkedIn amplifier (a social Piece blocked by the blog), and slot / reslot / de-slot on the Calendar — everything applied in one approved batch through the content-os MCP tools. Use when Davide wants to plan the week by hand, ahead of or instead of the Monday reminder.
---

# The Desk

The **Desk** is the interactive planning session where Davide works the [Pipeline](../../../CONTEXT.md)
by hand, in the loop — the session the Monday [Beat](../../../CONTEXT.md) only *reminds* him to open
(the Beats detect staleness and nudge — ADR-0013). It judges by the shared editorial brain
([`docs/agents/editorial-signals.md`](../../../docs/agents/editorial-signals.md)) and drives the tracker
through the **content-os MCP tools** — the operations adapter over the Supabase contract
([ADR-0015](../../../docs/adr/0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md)), on
the model from [ADR-0014](../../../docs/adr/0014-pipeline-source-of-truth-moves-to-supabase.md). See
also [ADR-0007](../../../docs/adr/0007-desk-interactive-planning-surface.md).

Nothing is written until Davide approves the whole plan in **one gate**. The Desk does **not** draft
content ([ADR-0002](../../../docs/adr/0002-no-app-repo-plus-claude-routines.md)) — it judges and routes;
the Factories write.

## The model (what the Desk moves)

Per ADR-0014, **Ideas are a live pool** — never accepted or rejected. Judgement happens on the
**output**:

- an **Idea** stays `live`; it is **archived** (reversible) only when a duplicate or repudiated;
- a **Piece** is one channel output (`blog`/`linkedin`) with lifecycle
  `proposed → slotted → in_production → published` (+ `declined`), a Flag/Side, and a date;
- a **Talk** is a dateless output (`proposed → in_production → ready`, + `declined`), Flag/Side, no date;
- a Piece can **block** a sibling Piece (the amplifier blocked by the blog it sneak-peeks);
- **correlation** turns live Ideas into proposed Pieces/Talks (many Ideas → one output is fine).

The Desk correlates, judges proposals, archives, blocks, and slots/reslots/de-slots. It does **not**
advance a Piece/Talk past `slotted`/`proposed`, and does **not** run the Engagement/CFP tier — those
stay manual or a later slice (see the scope guard).

## Before you start

- Run from a `content-os` checkout, with the **`content-os-capture` MCP server** available (it is
  configured user-level, so its tools — `list_ideas`, `list_proposals`, `list_calendar`, `spawn_piece`,
  `slot_piece`, `deslot_piece`, `decline_piece`, `spawn_talk`, `decline_talk`, `archive_idea`,
  `block_piece`, `set_piece_artifact` — are present).
- **You are the brain.** The judgement is you (Claude) + Davide in conversation — never an autonomous
  model. Read the framework, apply it live.
- **Reads are free; writes wait for the gate.** Call the `list_*` tools freely to explore. Call **no**
  write tool until Davide says "go" — every write hits the live Pipeline immediately.

## The session

### 1 — Read the Pipeline

Call `list_ideas`, `list_proposals`, and `list_calendar`. Present them to Davide scannably:

- **Idea pool** — `list_ideas` (the live pool): the raw material to correlate. Not an inbox to clear.
- **Untriaged proposals** — `list_proposals` (Pieces/Talks in `proposed`): outputs awaiting a
  pursue/decline. This is the staleness signal the Monday Beat watches.
- **The Calendar** — `list_calendar` (scheduled Pieces with dates): the week ahead + recent context.

Call the [Cadence](../../../CONTEXT.md) floor out loud — **counted over Pieces, never Ideas**: is there
a `linkedin` Piece covering this week? a `blog` Piece this month?

### 2 — Load the brain

Read [`editorial-signals.md`](../../../docs/agents/editorial-signals.md) and judge by **its** four
signals + routing — that doc is the single definition; do not restate it here.

### 3 — Decide together

Work the pool and the proposals with Davide — he brings context you don't have, you bring the state and
the framework. Propose, discuss, converge — the Pipeline is still untouched; exploration is free.

- **Correlate ripe Ideas → outputs.** For each Idea (or set) that has a thesis + voice match, decide the
  Piece(s)/Talk it becomes: a **Flag/Side** and, for a Piece, **one channel**; carry the source Idea
  id(s). Material for several channels → **one Piece per channel**.
  - **Amplifier decision:** does a `blog` Piece earn a `linkedin` amplifier? If yes, that amplifier is a
    **separate `linkedin` Piece, blocked by the blog Piece** (it sneak-peeks the blog, so it can't be
    worked first) — deliberately not a duplicate.
- **Leave the rest in the pool.** Off-voice / stale / not-yet-ripe Ideas are **not** rejected — they stay
  `live` for a later round.
- **Archive** only a duplicate or repudiated Idea (with a reason; a duplicate points at its twin).
- **Judge the current proposals:** pursue (→ slot this week) or **decline** (kept, so it isn't
  re-proposed).
- Run the **overlap check** (against recent `published` + the open proposals/calendar). Then **slot the
  week**, defending the Cadence floor (≥ 1 `linkedin` Piece this week, `blog` progress this month) and
  steering toward ~70% Flag.

**Dry week:** if the floor can't be met from existing material, [recycle](../../../CONTEXT.md) on-voice
material together (a parked Idea, or an amplifier angle off a published blog / upcoming talk). Never
generate a net-new topic ([ADR-0006](../../../docs/adr/0006-dry-pipeline-recycle-and-prompt-never-generate.md)).

### 4 — Revisions (reslot / de-slot)

As Davide directs, revise Pieces already dated — **hold these until the gate too**:

- **reslot** — keep it, move the date: `slot_piece(id, <YYYY-MM-DD>)`
- **de-slot** — off the week, back to the pool (`proposed`): `deslot_piece(id)`

### 5 — One gate (apply)

When the plan is agreed, present it as a plain-language batch for a single explicit **"go"** — list every
proposal (output, Flag/Side, channel, source Idea(s)), each amplifier block, each decline, each archive
(with reason), and each slot/reslot/de-slot. **Nothing above has touched the Pipeline yet.**

On "go", call the tools in order. `spawn_piece`/`spawn_talk` return the new id — capture it to block or
slot that output:

- `spawn_piece(channel, flag_side, title, idea_ids)` → the blog Piece; then
  `spawn_piece("linkedin", flag_side, title, idea_ids)` → the amplifier; then
  `block_piece(id=<amp>, blocked_by=<blog>)`.
- `spawn_talk(flag_side, title, idea_ids)` for a talk arc.
- `slot_piece(id, YYYY-MM-DD)` to schedule (same call reslots); `deslot_piece(id)` to pull it back.
- `decline_piece(id)` / `decline_talk(id)` for a proposal you won't pursue.
- `archive_idea(id, reason, duplicate_of?)` for a duplicate/repudiated Idea.

### 6 — Ping (opt-in only)

Off by default — Davide is in the room. Only if he asks "send it to me", use the notify seam
(`notify_ping` in `scripts/beats/lib.sh`) with a one-line plan summary.

## Guardrails

- **One brain** — the judgement lives in `editorial-signals.md`; read it, never copy the framework here.
- **One gate** — no write tool is called until Davide says "go".
- **Never drafts content** — judge and route only.
- **Scope guard** — the Desk correlates Ideas into proposals, judges proposals (pursue/decline),
  archives Ideas, blocks siblings, and slots/reslots/de-slots. It does **not** advance Pieces/Talks to
  `in_production`/`published`/`ready`, and does **not** run the Engagement/CFP lifecycle — those stay
  manual or a later slice.

## Verify

No unit tests — a prompt is driven, not tested. Verify at the ops seam (against a local Supabase): seed a
few live Ideas + a `proposed` Piece, run a session, and assert **correlate** spawns Pieces/Talks
(`proposed` + Flag/Side + channel, source Ideas linked), a blog→social **block** edge is set, **decline**
marks a proposal `declined`, **archive** moves an Idea to `archived`, and slot/reslot/de-slot land on the
Calendar — all only after the single "go", nothing before it. Then clean up the seed.
