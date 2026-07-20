# Monday planning reminder: nudge Davide to run /desk

The first of the three [Beats](../../CONTEXT.md) — a **deterministic staleness reminder** (ADR-0013),
not a planner. Every Monday morning it asks one question from **observable facts**: are there
**untriaged proposals** waiting? If yes, it pings *"time to plan: run `/desk`"*; if not, it **stays
silent**. The planning itself happens live in the [Desk](../../CONTEXT.md), where Davide is in the loop
and the [editorial signal framework](editorial-signals.md) is applied — the Beat only taps him on the
shoulder.

**Hands, not brain** (ADR-0003), taken to its limit: there is **no model** here (the Gemini `decide`
step left with ADR-0013) and **no maintained state file** — the signal is read straight off the
Pipeline. It **never judges, never drafts content** (ADR-0002), and never writes the Pipeline; the Desk
does all of that.

## The staleness signal

**Untriaged proposals waiting.** Since the Pipeline moved to Supabase (ADR-0014), Ideas are a **live
pool** that is never "judged" one by one — judgement happens on the **output**: the Desk correlates the
pool into `proposed` Pieces/Talks and then pursues (→ slot) or declines each. So the staleness signal is
**proposals awaiting that pursue/decline**, surfaced by the
[`untriaged_proposals`](../design/supabase-foundations.md#views) view (`proposed` Pieces + Talks). `detect`
counts them with one PostgREST read:

```sh
# GET ${SUPABASE_URL}/rest/v1/untriaged_proposals?select=id  →  count the rows
curl -fsS "$SUPABASE_URL/rest/v1/untriaged_proposals?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | jq 'length'
```

- **≥ 1 proposal** → **ping** "🗓️ Time to plan — run `/desk`".
- **0 proposals** → **silent**. Silence is the all-clear (like the Thursday guard); a clear board is
  never announced.

The threshold starts at **≥ 1** and is the only knob.

## What it runs against

- **Reads:** the `untriaged_proposals` view over Supabase PostgREST (`supabase_get` in `lib.sh`, with the
  `service_role` key). Nothing else — no calendar, no metrics.
- **Writes:** at most **one** Telegram ping via the [notify seam](notify.md), or nothing.

## Trigger

Runs on **GitHub Actions cron**, Monday (`0 6 * * 1`, ≈ 08:00 Europe/Rome summer) — the shared
`detect → ping` mechanism in [beat-scheduling.md](beat-scheduling.md). Debug a single run without
sending with `bash scripts/beats/monday.sh detect`.

## Verification (tracker + notify seams, dry-run)

No unit tests — a Beat is a deterministic reminder, driven and observed at the two seams (the spec's
Testing Decisions). Verify **both branches**:

1. **Stale → a ping** — the `untriaged_proposals` view returns ≥ 1 row; `monday.sh detect` prints the
   reminder, and `run` **delivers** it, exit 0.
2. **Fresh → silence** — the view returns 0 rows; `detect` prints **nothing** and `run` **withholds** the
   ping (empty argument → silent, exit 0).
3. **Fail-loud** — with the read unreachable, `run` **aborts non-zero** and sends nothing.

Verified **2026-07-20** at both seams against a **fake PostgREST + fake Telegram** stub (point
`SUPABASE_URL` and `TELEGRAM_API_BASE` at the stub — no live project or Bot API mutated): 2 proposals →
`detect` counted them and `run` **delivered** the reminder (exit 0); 0 proposals → `detect` silent, `run`
sent nothing (exit 0); the stub down → `run` **aborted non-zero**, no ping. Live auth (the real
`service_role` key) is confirmed by the workflow's prereq smoke-check on the first scheduled run.
