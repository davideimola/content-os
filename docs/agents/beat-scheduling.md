# Beat scheduling: GitHub Actions, detect → ping

The three [Beats](../../CONTEXT.md) run on **GitHub Actions cron**, not native Claude routines: the
routines' cloud env proxies network access to a pinned set and can't be relied on to reach arbitrary
egress, while the Beats need to reach **Supabase** (the Pipeline, [ADR-0014](../adr/0014-pipeline-source-of-truth-moves-to-supabase.md))
and the Telegram Bot API. An Actions runner has full internet egress. See
[ADR-0010](../adr/0010-beats-run-as-github-actions-not-claude-routines.md) and
[the zero-cost research](../research/zero-cost-agentic-ci.md).

## detect → ping (ADR-0013)

Each Beat is `scripts/beats/<beat>.sh` — a **deterministic staleness reminder**, no model:

```
DETECT  (a curl on a Supabase view)        → the reminder text, or nothing (fresh → silence)
PING    (a Telegram curl via notify_ping)  → one message, or silence
```

`run` is just `DETECT` handed to `notify_ping` (the shared `beat_ping` helper) — an empty detect result
is **silence**, a first-class outcome. `detect` runs under `errexit` + `pipefail`, so a failing read
(auth, network, a `curl -f` HTTP error) **aborts the run non-zero** rather than emitting empty: a
swallowed error never masquerades as a fresh all-clear (nor as a false nudge). No editorial judgement
runs here (that left the Beats with Gemini, ADR-0013): the Beat detects staleness from **observable
facts** — a PostgREST read on a Supabase view, with **no maintained state file** — and nudges Davide to
open the interactive session that does the work: the [Desk](../../CONTEXT.md) (`/desk`) or the
[Review](../../CONTEXT.md) (`/review`). The read is a `curl` on a view (ADR-0014 dec.7), not the
content-os MCP adapter — that adapter is the AI-app door; the Beats are a non-AI surface reading
PostgREST directly, like the front end ([ADR-0015](../adr/0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md)
dec.1). The two stages are separately runnable for debugging:
`scripts/beats/monday.sh {detect|run}` — `detect` shows the staleness call without sending.

The staleness signal per Beat (each beat doc has the detail):

- **Monday** ([monday-beat.md](monday-beat.md)) → **untriaged proposals** (`proposed` Pieces/Talks in the
  [`untriaged_proposals`](../design/supabase-foundations.md#views) view) waiting → "time to plan: run
  `/desk`"; none → silent. (Ideas are a live pool, never "unjudged" — ADR-0014.)
- **Thursday** ([thursday-beat.md](thursday-beat.md)) → this week's **LinkedIn slot open** (the
  `cadence_status` view's `linkedin_week_covered` is false) → "run `/desk` or ship one"; covered → silent.
- **Monthly** ([monthly-beat.md](monthly-beat.md), which is [`/review`](../../.claude/skills/review/SKILL.md)'s
  procedure) → last month's metrics **absent from the DB** (no `metrics_site` row for the month) → "import
  metrics + run `/review`"; present → silent.

## The workflow

[`.github/workflows/beats.yml`](../../.github/workflows/beats.yml): checkout → select the beat
(`github.event.schedule` → `monday`/`thursday`/`monthly`) → a deterministic prereq smoke-check (a
read against the `untriaged_proposals` view, surfacing any Supabase/auth issue in the log) →
`bash scripts/beats/<beat>.sh run`. Pure bash — `curl` + `jq`, no `gh`, no Go build (ADR-0009). Also
`workflow_dispatch` (a `beat` input) for manual/test runs.

- **All three Beats are live** — `monday.sh`, `thursday.sh`, and `monthly.sh` all exist and their crons
  are active (`0 6 * * 1`, `0 6 * * 4`, `0 6 1 * *`; ≈ 08:00 Europe/Rome summer). Any can also be run
  on demand via `workflow_dispatch`.

## Secrets (repo → Settings → Secrets and variables → Actions)

| Secret | What | Notes |
| ------ | ---- | ----- |
| `SUPABASE_URL` | project API base, `https://<ref>.supabase.co` | `supabase_get` hits `${SUPABASE_URL}/rest/v1/<view>`. |
| `SUPABASE_SERVICE_ROLE_KEY` | the project's `service_role` key | reads the RLS-guarded views (`untriaged_proposals`, `cadence_status`, `metrics_site`), which `service_role` has SELECT on. No broader than the `SUPABASE_ACCESS_TOKEN`/`DB_PASSWORD` the migrations CI already holds. |
| `TELEGRAM_BOT_TOKEN` | BotFather token | read by the notify seam (`notify_ping`) |
| `TELEGRAM_CHAT_ID` | Davide's chat id | read by the notify seam (`notify_ping`) |

The old `GH_PROJECT_PAT` is gone — the Beats no longer touch GitHub Issues/Projects. No model key
either: the Beats call no model (ADR-0013), so there is nothing like a `GEMINI_API_KEY` to keep.

## Testing / operating

- **Manual run:** Actions → *Content OS Beats* → *Run workflow* → pick the beat; or
  `gh workflow run beats.yml -f beat=monday`.
- **Dry-run the decision (no ping):** `bash scripts/beats/<beat>.sh detect` prints the reminder text, or
  nothing when the Beat is fresh — the staleness call seen without sending. `run` adds the ping.
- **Read a run:** `gh run list --workflow beats.yml` → `gh run view <id> --log`. The prereq step and the
  Beat's `detect` output make a run legible; the deterministic reminder means the ping (or its silence)
  is the whole outcome — no agent to infer from.
- The native routines created earlier are left **disabled** on claude.ai/code and can be deleted there.

## Verification (tracker + notify seams, dry-run)

No unit tests — a Beat is a deterministic reminder, driven and observed at the two seams (the spec's
Testing Decisions). Each Beat is verified on **both branches** against a **fake PostgREST + fake Telegram
server** (point `SUPABASE_URL` and `TELEGRAM_API_BASE` at a local stub — no live project, no live Bot
API): the ping is **delivered** when stale, **withheld** (silent) when fresh, and a **broken read aborts
non-zero** (never a false all-clear).

Verified **2026-07-20** at both seams against the fake server, all branches:

- **Monday** — 2 untriaged proposals → `detect` emitted the "time to plan" reminder and `run`
  **delivered** it; 0 proposals → `detect` silent, `run` sent nothing.
- **Thursday** — `cadence_status.linkedin_week_covered = false` → `run` **delivered** the fixed nudge;
  `= true` → silent.
- **Monthly** — no `metrics_site` row for last month → `run` **delivered** "import metrics + run
  `/review`"; a row present → silent.
- **Fail-loud** — with the fake PostgREST down, `monday.sh run` **aborted non-zero** and sent nothing
  (a swallowed `curl` error never reads as a fresh all-clear).

Live auth (the real `service_role` key against the project) is confirmed separately by the workflow's
prereq smoke-check on the first scheduled run.
