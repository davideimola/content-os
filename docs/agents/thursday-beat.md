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

**Is the LinkedIn slot covered?** Covered = a `linkedin` Piece **published since the start of this
week**, or one credibly scheduled — `slotted`/`in_production` with a `publish_date` from **today through
Sunday**. Since the Pipeline moved to Supabase (ADR-0014) that whole test is computed **server-side** by
the [`cadence_status`](../design/supabase-foundations.md#views) view, so `detect` reads one boolean:

```sh
# GET ${SUPABASE_URL}/rest/v1/cadence_status?select=linkedin_week_covered  →  true | false
curl -fsS "$SUPABASE_URL/rest/v1/cadence_status?select=linkedin_week_covered" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | jq -r '.[0].linkedin_week_covered'
```

The view's window is today→end-of-week for the scheduled leg, so a `slotted` LinkedIn whose date already
**passed this week** without publishing is **not** covered — a slipping slot reads as at-risk.

- **Covered** (`linkedin_week_covered` is `true`) → **silent**. The absence of a message is the all-clear.
- **Open** (`false`) → **ping** the fixed nudge "📣 This week's LinkedIn slot is open → run `/desk` or
  ship one".

## What it runs against

- **Reads:** the `cadence_status.linkedin_week_covered` boolean over Supabase PostgREST (`supabase_get` in
  `lib.sh`, with the `service_role` key) — one field, enough to tell whether this week's slot is covered.
- **Writes:** at most **one** Telegram ping via the [notify seam](notify.md), or nothing. Never the
  Pipeline.

## Trigger

Runs on **GitHub Actions cron**, Thursday (`0 6 * * 4`, ≈ 08:00 Europe/Rome summer) — the shared
`detect → ping` mechanism in [beat-scheduling.md](beat-scheduling.md). Debug a single run without
sending with `bash scripts/beats/thursday.sh detect`.

## Verification (tracker + notify seams, dry-run)

No unit tests — a Beat is a deterministic reminder, driven and observed at the two seams. Verify **both
branches**:

1. **Open → a ping** — `cadence_status.linkedin_week_covered` is `false`; `thursday.sh detect` prints the
   fixed nudge and `run` **delivers** it, exit 0.
2. **Covered → silence** — the boolean is `true`; `detect` prints **nothing** and `run` **withholds** the
   ping (silent, exit 0).
3. **Fail-loud** — with the read unreachable, `run` **aborts non-zero** and sends nothing.

Verified **2026-07-20** at both seams against a **fake PostgREST + fake Telegram** stub (point
`SUPABASE_URL` and `TELEGRAM_API_BASE` at the stub): `linkedin_week_covered = false` → `detect` emitted
the fixed nudge and `run` **delivered** it (exit 0); `= true` → `detect` silent, `run` sent nothing (exit
0); the stub down → `run` **aborted non-zero**, no ping. The view's week/date logic itself is exercised in
SQL — the beat only reads the boolean it returns. No real Pipeline item mutated.
