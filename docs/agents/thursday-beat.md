# Thursday cadence guard Beat: rescue the week with one decision

The second [Beat](../../CONTEXT.md) — a scheduled Thursday session that guards the
[Cadence](../../CONTEXT.md) floor's weekly LinkedIn slot. It asks one question: **has this week's
LinkedIn shipped, or is it credibly scheduled?** If yes, it **stays silent**. If not, it pings **one**
ready proposal with the **single next action**, so recovering the week costs one decision, not a
brainstorm (user stories 12–14).

Silence is the success signal. The Cadence is a **floor, not a nag** (user story 14): on an on-track
week the guard says nothing; a heavy week is never interrupted to be told it's fine.

Like the [Monday Beat](monday-beat.md) it is **hands, not brain** (ADR-0003) and **never drafts
content** (ADR-0002): it reads the Pipeline, decides ship-vs-rescue, and at most sends one
[notify](notify.md) ping pointing at an existing proposal.

## What it runs against

- **Reads:** the `linkedin` pieces and their [Calendar](calendar.md) dates/states — enough to tell
  whether this week's slot is covered, and which proposal is the most ready to rescue it.
- **Writes:** at most **one** Telegram ping — or **nothing**. It never changes labels or the board;
  the [Monday Beat](monday-beat.md) does the planning, Thursday only guards.

Preconditions and the trigger mechanism are the same as the Monday Beat — see
[monday-beat.md](monday-beat.md#preconditions) and its [Scheduling](monday-beat.md#scheduling-ac4)
section. The Beat is **trigger-agnostic** (ADR-0003).

## The procedure

**1 — Frame the week.** Take the current calendar week (Mon–Sun) and "the rest of the week" as
**today → Sunday**.

**2 — Is the LinkedIn slot covered?** Look for a `linkedin` piece that is either **published this
week** or **credibly scheduled** — `slotted`/`in-production` with a `Date` from **today through
Sunday**:

```sh
# published this week? (separate label: qualifiers are AND; a comma inside one is OR)
gh issue list --repo davideimola/content-os --state all --search "label:linkedin label:published" \
  --json number,title,closedAt
# scheduled for the rest of the week? (board items with the linkedin label, dated today..Sunday)
gh project item-list 2 --owner davideimola --query "label:linkedin" --format json -L 200 \
  | jq --arg from <today> --arg to <sunday> '
      [ .items[] | select(.date != null and (.date[0:10]) >= $from and (.date[0:10]) <= $to) ]'
```

A `slotted` LinkedIn whose date has **already passed this week** without publishing counts as **not
covered** — the slot is slipping, so the guard treats it as at-risk.

**3 — Decide.**

- **On track** (published this week, or scheduled today→Sunday) → **stop. Send no ping.** The absence
  of a message is the all-clear.
- **At risk** (nothing shipped and nothing credibly scheduled) → pick the **single most-ready**
  `linkedin` proposal and ping it with the one next action (below).

**4 — The rescue ping (at-risk only).** One ping via the [notify seam](notify.md) naming one proposal and one action:

```sh
notify_ping "This week's LinkedIn hasn't shipped yet — one move rescues it.
→ <thesis of the most-ready proposal>
Next: write & post it today. <issue url>"
```

Keep it to **one** proposal and **one** action — the whole point is that acting costs one decision.
Rescue tone, never guilt (user story 14). The most-ready pick (heuristic below) **always resolves to
one concrete item** — a slotted piece, a proposal, or the single strongest idea — so the ping always
names *something specific* to ship, never "pick one" (that would be the brainstorm the guard exists to
remove). Only if the Pipeline is genuinely empty (no `linkedin` piece and no `idea` at all) does it
fall back to the same **dry-pipeline prompt** the Monday Beat uses
([ADR-0006](../adr/0006-dry-pipeline-recycle-and-prompt-never-generate.md)): a one-line "nothing
queued — capture one idea and ship a short take today." Like Monday, it recycles or prompts but
**never generates** a topic.

## The "most-ready" heuristic

Pick **one**, in this order — closest to shippable first:

1. A `slotted` `linkedin` piece already dated this week (just needs writing/posting).
2. Else a `proposed` `linkedin` piece — prefer `flag` over `side`, and the one with the clearest
   thesis (a single-point take ships fastest).
3. Else the strongest `idea` that could become a LinkedIn post today.

One, not a shortlist: a list is a brainstorm, and the guard's job is to remove the brainstorm.

## Scheduling (AC3)

Same mechanism as the [Monday Beat](monday-beat.md#scheduling-ac4) (native Claude routine **or**
GitHub Actions cron — one choice for all Beats, pending), only the day differs: **Thursday morning,
Europe/Rome** — GitHub Actions form `cron: '0 6 * * 4'`. The body here is the prompt whichever trigger
is wired.

## Verification (tracker seam, dry-run)

No unit tests — a Beat is a prompt (the spec's Testing Decisions). Verify **both** branches by driving
the check on a seeded week:

1. **At-risk → a ping** (AC1): seed one ready `proposed,flag,linkedin` proposal and leave the week
   with **no** published or scheduled LinkedIn. Run steps 1–4; confirm the check reports *at-risk* and
   a rescue ping is delivered naming that proposal + the single next action.
2. **On-track → silence** (AC2): put a `linkedin` piece on the board `slotted` with a `Date` in the
   rest of the week. Run steps 1–3; confirm the check reports *on-track* and **no** ping is sent.
3. Clean up the seed.

Verified **2026-07-17**: with a ready `proposed,flag,linkedin` proposal and no covered slot, the
check reported *at-risk* and a rescue ping was delivered (the notify seam, exit 0); after slotting
that piece this week, the re-check reported *on-track* and **no** ping was sent. Seed cleaned up. The
trigger (AC3) is deferred with the Monday Beat's shared mechanism choice.
