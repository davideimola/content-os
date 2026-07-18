# Beat scheduling: GitHub Actions, detect → ping

The three [Beats](../../CONTEXT.md) run on **GitHub Actions cron**, not native Claude routines: the
routines' cloud env proxies GitHub access to a pinned PR-review set and **cannot reach Projects v2**
(the [Calendar board](calendar.md)), which the Beats read. An Actions runner has full GitHub +
internet egress. See [ADR-0010](../adr/0010-beats-run-as-github-actions-not-claude-routines.md) and
[the zero-cost research](../research/zero-cost-agentic-ci.md).

## detect → ping (ADR-0013)

Each Beat is `scripts/beats/<beat>.sh` — a **deterministic staleness reminder**, no model:

```
DETECT  (deterministic gh + repo checks)   → the reminder text, or nothing (fresh → silence)
PING    (a Telegram curl via notify_ping)  → one message, or silence
```

`run` is just `DETECT` handed to `notify_ping` (the shared `beat_ping` helper) — an empty detect result
is **silence**, a first-class outcome. `detect` runs under `errexit`, so a failing `gh` (auth, quota,
network) **aborts the run non-zero** rather than emitting empty: a swallowed error never masquerades as
a fresh all-clear (nor as a false nudge). No editorial judgement runs here (that left the Beats with Gemini, ADR-0013): the Beat detects
staleness from **observable facts** — `gh` + the repo, with **no maintained state file** — and nudges
Davide to open the interactive session that does the work: the [Desk](../../CONTEXT.md) (`/desk`) or the
[Review](../../CONTEXT.md) (`/review`). The two stages are separately runnable for debugging:
`scripts/beats/monday.sh {detect|run}` — `detect` shows the staleness call without sending.

The staleness signal per Beat (each beat doc has the detail):

- **Monday** ([monday-beat.md](monday-beat.md)) → open **unjudged Ideas** waiting → "time to plan: run
  `/desk`"; none → silent.
- **Thursday** ([thursday-beat.md](thursday-beat.md)) → this week's **LinkedIn slot open** (not published
  this week, not `slotted`/`in-production` today→Sunday) → "run `/desk` or ship one"; covered → silent.
- **Monthly** ([monthly-beat.md](monthly-beat.md), which is [`/review`](../../.claude/skills/review/SKILL.md)'s
  procedure) → last month's `metrics/<YYYY-MM>/` **missing** → "import metrics + run `/review`"; present
  → silent.

## The workflow

[`.github/workflows/beats.yml`](../../.github/workflows/beats.yml): checkout → select the beat
(`github.event.schedule` → `monday`/`thursday`/`monthly`) → a deterministic prereq smoke-check →
`bash scripts/beats/<beat>.sh run`. Pure bash — `gh` + `curl` + `jq`, no Go build (ADR-0009). Also
`workflow_dispatch` (a `beat` input) for manual/test runs.

- **All three Beats are live** — `monday.sh`, `thursday.sh`, and `monthly.sh` all exist and their crons
  are active (`0 6 * * 1`, `0 6 * * 4`, `0 6 1 * *`; ≈ 08:00 Europe/Rome summer). Any can also be run
  on demand via `workflow_dispatch`.

## Secrets (repo → Settings → Secrets and variables → Actions)

| Secret | What | Notes |
| ------ | ---- | ----- |
| `GH_PROJECT_PAT` | GitHub PAT (classic), scopes **`repo` + `project` + `read:org`** | `read:org` is required too — `gh project --owner <user>` needs it to resolve the owner (else "unknown owner type"). `gh` reads it via `GH_TOKEN`. |
| `TELEGRAM_BOT_TOKEN` | BotFather token | read by the notify seam (`notify_ping`) |
| `TELEGRAM_CHAT_ID` | Davide's chat id | read by the notify seam (`notify_ping`) |

No model key: the Beats call no model (ADR-0013), so there is nothing like a `GEMINI_API_KEY` to keep.

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
Testing Decisions). Each Beat is verified on **both branches** against a fake Telegram server
(`TELEGRAM_API_BASE`, no live Bot API): the ping is **delivered** when stale, **withheld** (silent) when
fresh. Monday and Thursday keep their recorded runs in [monday-beat.md](monday-beat.md#verification-tracker--notify-seams-dry-run)
and [thursday-beat.md](thursday-beat.md#verification-tracker--notify-seams-dry-run).

**Monthly** — verified **2026-07-18**: with last month's `metrics/2026-06/` absent, `monthly.sh detect`
emitted the "import metrics + run `/review`" reminder and `run` **delivered** it (exit 0); after creating
`metrics/2026-06/`, `detect` returned empty and `run` sent **nothing** (silent, exit 0). The throwaway
dir was removed, leaving the repo's `metrics/` untouched.
