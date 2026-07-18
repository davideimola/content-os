---
name: desk
description: Open the Desk — an interactive, on-demand editorial planning session over the three-tier Content OS Pipeline. Judge each new Idea accept (spawn one or more Pieces) or reject (close), decide whether a blog earns a LinkedIn amplifier (a social Piece blocked by the blog Piece), and slot / reslot / de-slot Pieces on the Calendar — everything applied in one approved batch. Use when Davide wants to plan the week by hand, ahead of or instead of the Monday reminder, or to work and adjust the Pipeline interactively.
---

# The Desk

The **Desk** is the interactive planning session where Davide works the [Pipeline](../../../CONTEXT.md)
by hand, in the loop — the session the Monday [Beat](../../../CONTEXT.md) only *reminds* him to open
(the Beats no longer plan; they detect staleness and nudge — ADR-0013). It judges by the shared
editorial brain ([`docs/agents/editorial-signals.md`](../../../docs/agents/editorial-signals.md)) and
drives the tracker through the deterministic **Desk hands** in
[`scripts/beats/lib.sh`](../../../scripts/beats/lib.sh). See
[ADR-0007](../../../docs/adr/0007-desk-interactive-planning-surface.md) and
[ADR-0011](../../../docs/adr/0011-pipeline-three-tier-idea-pieces-cfps.md).

Nothing is written until Davide approves the whole plan in **one gate**. The Desk does **not** draft
content ([ADR-0002](../../../docs/adr/0002-no-app-repo-plus-claude-routines.md)) — it judges and
routes; the Factories write.

## The three tiers (what the Desk moves)

The Pipeline is **Idea → Pieces → CFPs** ([pipeline-taxonomy.md](../../../docs/agents/pipeline-taxonomy.md)):

- an **Idea** is judged **accept** (it spawns one or more Pieces and stays open as their umbrella) or
  **reject** (closed with a reason); an Idea is never dated and never carries a Piece state;
- a **Piece** is one channel output (`blog`/`linkedin`/`talk`) with its own lifecycle
  `proposed → slotted → in-production → published`, a Flag/Side, and a date;
- a Piece can **block** a sibling Piece (the amplifier blocked by the blog it sneak-peeks).

The Desk works Ideas and Pieces. It advances Pieces only up to `slotted` (see the scope guard); the CFP
tier stays manual for now.

## Before you start

- Run from a `content-os` checkout, with `gh` authenticated (`repo` + `project` scopes).
- The Desk hands live in `scripts/beats/lib.sh` — you call them directly (the Beat runners are being
  slimmed to reminders and no longer share a gather/apply path with the Desk).
- **You are the brain.** The judgement is you (Claude) + Davide in conversation — never an autonomous
  model. Read the framework, apply it live.

## The session

### 1 — Read the Pipeline

```sh
bash -c 'source scripts/beats/lib.sh; read_pipeline'
```

That prints the three-tier state as JSON. Present it to Davide scannably:

- **Idea inbox** — `ideas_unjudged` (open Ideas with **no** Piece yet): the work to judge.
- **Accepted umbrellas** — `ideas_accepted` (open Ideas with `.pieces` children): context, already judged.
- **Pieces in flight** — `pieces` (`proposed`/`slotted`/`in-production`) with their labels.
- **This week's board** — `board` items with dates and `stage`; and recent **published** for the overlap check.

Call the [Cadence](../../../CONTEXT.md) floor out loud — **counted over Pieces, never Ideas**: is there
a `linkedin` Piece covering this week? a `blog` Piece this month?

### 2 — Load the brain

Read [`editorial-signals.md`](../../../docs/agents/editorial-signals.md) and judge by **its** four
signals + routing — that doc is the single definition; do not restate it here.

### 3 — Decide together

Work each **unjudged Idea** with Davide — he brings context you don't have, you bring the state and the
framework:

- **Accept** → decide the Piece(s) it spawns: for each, a **Flag/Side** and **one channel**. An Idea
  with material for several channels spawns **one Piece per channel**.
  - **Amplifier decision:** does a `blog` Piece earn a `linkedin` amplifier? If yes, that amplifier is a
    **separate `linkedin` Piece, blocked by the blog Piece** (it sneak-peeks the blog, so it can't be
    worked first) — deliberately not a duplicate of the blog.
- **Reject** → close with a one-line why.

Run the **overlap check** (against `published` + open `pieces`). Then **slot the week** on the
Calendar, defending the Cadence floor (≥ 1 `linkedin` Piece this week, `blog` progress this month),
steering toward ~70% Flag. Propose, discuss, converge — the Pipeline is still untouched; exploration is
free.

**Dry week:** if the floor can't be met from existing material, [recycle](../../../CONTEXT.md) on-voice
material together (a parked Idea, or an amplifier angle off a published blog / upcoming talk). Never
generate a net-new topic ([ADR-0006](../../../docs/adr/0006-dry-pipeline-recycle-and-prompt-never-generate.md)).

### 4 — Revisions (reslot / de-slot)

As Davide directs, revise Pieces already on the board — **hold these until the gate too**:

- **reslot** — keep it, move the date (stays `slotted`): `slot_issue <piece> <YYYY-MM-DD>`
- **de-slot** — off the week, back to the pool (`proposed`): `deslot_issue <piece>`

### 5 — One gate (apply)

When the plan is agreed, present it as a plain-language batch for a single explicit **"go"** — list
every accept (with the Piece(s) and their Flag/Side + channel), each amplifier block, each reject (with
reason), and each slot/reslot/de-slot. **Nothing above has touched the Pipeline yet.**

On "go", run the Desk hands in order. Accept spawns Pieces and prints each new Piece number — capture it
to block or slot that Piece:

```sh
source scripts/beats/lib.sh

# accept idea #12 into a blog Piece + a LinkedIn amplifier blocked by it
blog=$(accept_idea 12 flag blog "Blog: <thesis>")
amp=$(accept_idea 12 flag linkedin "LinkedIn: sneak-peek of <thesis>")
block_piece "$amp" "$blog"          # amplifier blocked_by the blog Piece

# reject idea #13
reject_idea 13 "Off-voice — not related to the Positioning."

# slot the blog Piece this week (reslot is the same call with a new date)
slot_issue "$blog" 2026-07-17

# de-slot a Piece back to the pool
deslot_issue 40
```

Each hand is label-first on the issue (the source of truth), then mirrored onto board #2
([calendar.md](../../../docs/agents/calendar.md)). The Idea stays **open** after accept — it is the
umbrella over its Pieces.

### 6 — Ping (opt-in only)

Off by default — Davide is in the room. Only if he asks "send it to me":

```sh
source scripts/beats/lib.sh
notify_ping "<one-line plan summary + issue/board links>"
```

## Guardrails

- **One brain** — the judgement lives in `editorial-signals.md`; read it, never copy the framework here.
- **One gate** — the Pipeline is untouched until Davide says "go".
- **Never drafts content** — judge and route only.
- **Scope guard** — the Desk accepts/rejects Ideas, spawns Pieces, blocks siblings, and slots/reslots/
  de-slots. It does **not** advance Pieces to `in-production`/`published`, and does **not** run the CFP
  lifecycle — those stay manual (`gh`) or a future slice.

## Verify

No unit tests — a prompt is driven, not tested. Verify at the tracker seam: seed a couple of `idea`
issues + one `slotted` Piece, run a session, and assert **accept** spawns Piece(s) as native sub-issues
(each `proposed` + Flag/Side + one channel, the Idea still open), **reject** closes the Idea, a
blog→social **block** edge is visible, and slot/reslot/de-slot land on the issues and board #2 — all
only after the single "go", nothing before it. Then clean up the seed.
