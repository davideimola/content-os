# Thursday cadence guard: nudge when the LinkedIn slot is open

The second [Beat](../../CONTEXT.md) — a **deterministic staleness reminder** (ADR-0013) guarding the
[Cadence](../../CONTEXT.md) floor's weekly LinkedIn slot. It asks one question from **observable facts**:
is this week's LinkedIn slot **covered**? If yes, it **stays silent**; if not, it pings a **fixed** nudge
to run [`/desk`](../../CONTEXT.md) or ship one. Recovering the week is then Davide's live decision at the
Desk — the guard only surfaces that the slot is open.

Silence is the success signal. The Cadence is a **floor, not a nag** (user story 14): an on-track week
is never interrupted. **Hands, not brain** (ADR-0003) with **no model** and **no state file** — and it
**never drafts content** (ADR-0002) or touches labels or the board; Monday plans, Thursday only guards.
Unlike the old guard it **no longer names a specific proposal** — the "most-ready piece" pick was the
model's job (removed with ADR-0013); the Desk picks live.

## The staleness signal

**Is the LinkedIn slot covered?** Covered = a `linkedin` Piece **published this week**, or one credibly
scheduled — `slotted`/`in-production` with a `Date` from **today through Sunday**. `detect` checks both:

```sh
# published this week? (separate labels are AND; a comma inside one is OR)
gh issue list --repo davideimola/content-os --state all --search "label:linkedin label:published" \
  --json closedAt   # keep those closed within Mon..Sun
# scheduled for the rest of the week? (linkedin board items dated today..Sunday, slotted/in-production)
gh project item-list 2 --owner davideimola --query "label:linkedin" --format json -L 200 \
  | jq --arg from <today> --arg to <sunday> '
      [ .items[] | select(.date != null and (.date[0:10]) >= $from and (.date[0:10]) <= $to
        and ((.stage=="slotted") or (.stage=="in-production"))) ]'
```

A `slotted` LinkedIn whose date already **passed this week** without publishing is **not** covered — the
scheduled check only counts today→Sunday, so a slipping slot reads as at-risk.

- **Covered** (published this week, or scheduled today→Sunday) → **silent**. The absence of a message is
  the all-clear.
- **Open** (nothing shipped and nothing credibly scheduled) → **ping** the fixed nudge "📣 This week's
  LinkedIn slot is open → run `/desk` or ship one", with the board link.

## What it runs against

- **Reads:** the `linkedin` pieces and their [Calendar](calendar.md) dates/states — enough to tell
  whether this week's slot is covered.
- **Writes:** at most **one** Telegram ping via the [notify seam](notify.md), or nothing. Never labels,
  never the board.

## Trigger

Runs on **GitHub Actions cron**, Thursday (`0 6 * * 4`, ≈ 08:00 Europe/Rome summer) — the shared
`detect → ping` mechanism in [beat-scheduling.md](beat-scheduling.md). Debug a single run without
sending with `bash scripts/beats/thursday.sh detect`.

## Verification (tracker + notify seams, dry-run)

No unit tests — a Beat is a deterministic reminder, driven and observed at the two seams. Verify **both
branches** on a seeded week:

1. **Open → a ping** — leave the week with **no** published or scheduled LinkedIn; `thursday.sh detect`
   prints the fixed nudge and `run` **delivers** it against the fake Telegram server, exit 0.
2. **Covered → silence** — put a `linkedin` piece on the board `slotted` with a `Date` in the rest of the
   week; `detect` prints **nothing** and `run` **withholds** the ping (silent, exit 0).
3. Clean up the seed.

Verified **2026-07-18** at the tracker + notify seams (fake Telegram via `TELEGRAM_API_BASE`), all
branches driven deterministically over the live week (Mon 07-13 → Sun 07-19), the date filter exercised
for real: no published/scheduled LinkedIn → `detect` emitted the fixed nudge and `run` **delivered** it
(exit 0); a LinkedIn published this week, and separately one `slotted` today→Sunday, each left `detect`
**silent** (`run` sent nothing, exit 0); a `slotted` piece whose date already **passed** this week
correctly read as **open** → ping. No real Pipeline item mutated.
