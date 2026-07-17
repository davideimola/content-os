---
name: desk
description: Open the Desk — an interactive, on-demand editorial planning session over the Content OS Pipeline. Judge new Ideas into proposals, slot the week defending the Cadence floor, and revise moves (reslot / de-slot), applying everything in one approved batch. Use when Davide wants to plan the week by hand — ahead of, or instead of, the Monday Beat — or to work and adjust the Pipeline interactively.
---

# The Desk

The **Desk** is the interactive counterpart to the Monday planning [Beat](../../../CONTEXT.md):
an on-demand session where Davide plans the Pipeline by hand, in the loop, instead of waiting for
the scheduled Beat. It runs the *same arc* and judges by the *same brain*
([`docs/agents/monday-beat.md`](../../../docs/agents/monday-beat.md)) and reuses the *same
deterministic hands* as the Beat — only the **DECIDE** step is different: here it is **you (Claude) +
Davide, in conversation**, never Gemini. See [ADR-0007](../../../docs/adr/0007-desk-interactive-planning-surface.md).

Nothing is written until Davide approves the whole plan in **one gate**. The Desk does **not** draft
content ([ADR-0002](../../../docs/adr/0002-no-app-repo-plus-claude-routines.md)) — it judges and
routes; the Factories write.

## Before you start

- Run from a `content-os` checkout, with `gh` authenticated (`repo` + `project` scopes).
- `contentos` on PATH (or `go run ./cmd/contentos`) — only needed for the **opt-in** ping.
- **You are the DECIDE brain.** Never call `scripts/beats/monday.sh decide` (that is the Gemini path).
  You reuse only `gather` (read) and `apply` (write).

## The session

### 1 — Read the Pipeline (GATHER, reuse the Beat's hand)

```sh
bash scripts/beats/monday.sh gather
```

That prints the exact state JSON the Monday Beat sees. Present it to Davide scannably: the **Idea
inbox**, what is **in flight**, **this week's board** (with dates), and recent **published** for the
overlap check. Call the [Cadence](../../../CONTEXT.md) floor status out loud — is there a LinkedIn
piece for this week? blog progress this month?

### 2 — Load the brain

Read [`docs/agents/monday-beat.md`](../../../docs/agents/monday-beat.md) and judge by **its** editorial
signal framework and **its** arc — that doc defines the signals; do not restate them here. Do not
reinvent the judgement — the Desk and the Beat judge the same way, from the same doc.

### 3 — Decide together (DECIDE — this is the Desk)

Work the arc interactively. Davide brings context you do not have; you bring the state and the
framework. For each Idea: **promote** (assign Flag/Side + one channel) / **hold** (name the one thing
that would sharpen it) / **drop** (with a one-line why). Run the **overlap check** against published and
in-flight. Then **slot the week** defending the Cadence floor (≥ 1 LinkedIn this week, blog progress),
steering toward ~70% Flag. Propose, discuss, converge — the Pipeline is still untouched; exploration is
free.

**Dry week:** interactively, the Beat's "prompt Davide for one idea" fallback is moot — he is here.
[Recycle](../../../CONTEXT.md) on-voice material together, or just talk it through. Never generate a
net-new topic ([ADR-0006](../../../docs/adr/0006-dry-pipeline-recycle-and-prompt-never-generate.md)).

### 4 — Revisions (reslot / de-slot)

As Davide directs, revise pieces already on the board — **hold these until the gate too**:

- **reslot** — keep it, move the date (stays `slotted`):
  ```sh
  bash -c 'source scripts/beats/lib.sh; slot_issue <n> <YYYY-MM-DD>'
  ```
- **de-slot** — off the week, back to the pool (`proposed`):
  ```sh
  bash -c 'source scripts/beats/lib.sh; deslot_issue <n>'
  ```
  A de-slot is meant to stay out of the Beat's auto-recycle
  ([ADR-0006](../../../docs/adr/0006-dry-pipeline-recycle-and-prompt-never-generate.md)) — though that
  exclusion is not yet wired into the Beat's `gather` (see
  [ADR-0007](../../../docs/adr/0007-desk-interactive-planning-surface.md)).

**Scope guard:** the Desk does **not** advance pieces to `in-production`/`published`, and does **not**
run the CFP lifecycle — those stay manual (`gh`/`contentos`) or a future slice.

### 5 — One gate (APPLY, reuse the Beat's hand)

When the plan is agreed, present it as the Beat's decision object for a single explicit **"go"**:

```json
{"promotions":[{"issue":0,"flag_side":"flag","channel":"linkedin"}],
 "holds":[{"issue":0,"comment":"..."}],
 "drops":[{"issue":0,"reason":"..."}],
 "slots":[{"issue":0,"date":"YYYY-MM-DD"}],
 "ping":""}
```

On "go", pipe it to the Beat's `apply` (the identical code path) and then run any reslot/de-slot hands
from step 4:

```sh
printf '%s' "$DECISIONS_JSON" | bash scripts/beats/monday.sh apply -
```

Keep `"ping":""` — the Desk does not ping (Davide is in the room), and an empty ping makes `apply`
stay silent (`notify_ping ""` sends nothing).

### 6 — Ping (opt-in only)

Off by default. Only if Davide asks "send it to me", ping the plan so it lands in his Telegram next to
the Beats':

```sh
source scripts/beats/lib.sh
notify_ping "<one-line plan summary + issue/board links>"
```

## Guardrails

- **One brain** — the judgement lives in `monday-beat.md`; read it, never copy the framework here.
- **One gate** — the Pipeline is untouched until Davide says "go".
- **Never drafts content** — judge and route only.

## Verify

No unit tests — a prompt is driven, not tested. Verify at the tracker seam: seed a couple of `idea`
issues + one `slotted` piece, run a session, and assert the promotions/slots/reslot/de-slot land on the
issues and on board #2, then clean up the seed.
