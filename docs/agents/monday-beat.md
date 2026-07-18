# Monday planning reminder: nudge Davide to run /desk

The first of the three [Beats](../../CONTEXT.md) — a **deterministic staleness reminder** (ADR-0013),
not a planner. Every Monday morning it asks one question from **observable facts**: have **unjudged
Ideas** piled up? If yes, it pings *"time to plan: run `/desk`"*; if not, it **stays silent**. The
planning itself happens live in the [Desk](../../CONTEXT.md), where Davide is in the loop and the
[editorial signal framework](editorial-signals.md) is applied — the Beat only taps him on the shoulder.

**Hands, not brain** (ADR-0003), taken to its limit: there is **no model** here (the Gemini `decide`
step left with ADR-0013) and **no maintained state file** — the signal is read straight off the tracker.
It **never judges Ideas, never drafts content** (ADR-0002), and never touches labels or the board; the
Desk does all of that.

## The staleness signal

**Unjudged Ideas waiting.** An unjudged Idea is the tier-identification rule from the
[taxonomy](pipeline-taxonomy.md#the-three-tiers): `idea` label, **open**, with **0 child Pieces**
(an accepted Idea has ≥ 1 child; a rejected one is closed). `detect` counts them:

```sh
# open ideas, then keep only those with no child Piece (the unjudged inbox)
gh issue list --repo davideimola/content-os --label idea --state open --json number
gh api repos/davideimola/content-os/issues/<n>/sub_issues --jq 'length'   # 0 ⇒ unjudged
```

- **≥ 1 unjudged** → **ping** "🗓️ Time to plan — run `/desk`", with the board link so acting is one tap.
- **0 unjudged** → **silent**. Silence is the all-clear (like the Thursday guard); a clear inbox is
  never announced.

The threshold starts at **≥ 1** and is the only knob.

## What it runs against

- **Reads:** open `idea` issues and their sub-issue counts (`gh` + the repo). Nothing else — no board,
  no metrics.
- **Writes:** at most **one** Telegram ping via the [notify seam](notify.md), or nothing.

## Trigger

Runs on **GitHub Actions cron**, Monday (`0 6 * * 1`, ≈ 08:00 Europe/Rome summer) — the shared
`detect → ping` mechanism in [beat-scheduling.md](beat-scheduling.md). Debug a single run without
sending with `bash scripts/beats/monday.sh detect`.

## Verification (tracker + notify seams, dry-run)

No unit tests — a Beat is a deterministic reminder, driven and observed at the two seams (the spec's
Testing Decisions). Verify **both branches**:

1. **Stale → a ping** — seed one open `idea` with **no** child Piece; `monday.sh detect` prints the
   reminder, and `run` **delivers** it against the fake Telegram server (`TELEGRAM_API_BASE`), exit 0.
2. **Fresh → silence** — leave no unjudged Idea (every open `idea` has ≥ 1 child, or there are none);
   `detect` prints **nothing** and `run` **withholds** the ping (empty argument → silent, exit 0).
3. Clean up the seed.

Verified **2026-07-18** at the tracker + notify seams (fake Telegram via `TELEGRAM_API_BASE`), both
branches: with unjudged Ideas present on the live Pipeline, `detect` counted them and `run` **delivered**
the reminder (exit 0). The fresh and accepted-Idea cases were driven deterministically (a stubbed
`gh`) so no real Idea was mutated: an empty inbox → `detect` silent, `run` sent nothing (exit 0); a mixed
inbox of one childless Idea + one with a child Piece → `detect` counted **only** the childless one
(the accepted Idea excluded per the tier rule); an accepted-only inbox → silent. Seed closed afterward.
