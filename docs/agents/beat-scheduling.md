# Beat scheduling: GitHub Actions + a free model

The three [Beats](../../CONTEXT.md) are scheduled by **GitHub Actions cron**, not by native Claude
routines. Native routines were tried and rejected: their cloud environment proxies GitHub access to a
pinned PR-review set and **cannot reach Projects v2** (the [Calendar board](calendar.md)), which every
Beat needs. An Actions runner has full GitHub + internet egress, so `gh` (issues **and** `gh project`),
`go`, and `contentos notify` all work. The Beat prompts stay **trigger- and model-agnostic** — they
live in `docs/agents/{monday,thursday,monthly}-beat.md`; the workflow only supplies the schedule, the
runtime, and the model. See [the zero-cost research](../research/zero-cost-agentic-ci.md) for why this
shape was chosen.

## The workflow

One file — [`.github/workflows/beats.yml`](../../.github/workflows/beats.yml). Three `schedule`
crons map to the three Beats (`github.event.schedule` → `monday`/`thursday`/`monthly`), plus a
`workflow_dispatch` with a `beat` input for manual/test runs. Each run: checks out the repo, builds
`contentos` onto `PATH`, then hands the matching Beat doc to the model via the **Gemini CLI action**
(`google-github-actions/run-gemini-cli`), which reads the doc and executes it — `gh` for the Pipeline
and board, `contentos notify` for the one Telegram ping.

Times are **UTC** (`0 6 * * 1|4` and `0 6 1 * *` ≈ 08:00 Europe/Rome in summer, 07:00 in winter — cron
does not follow DST).

## Model: free Google Gemini

The model is a **free Google AI Studio API key** (`GEMINI_API_KEY`, no card, ~1000 req/day — trivially
enough for ~9 runs/month) driving the official Gemini CLI action. Rationale and alternatives:
[zero-cost-agentic-ci.md](../research/zero-cost-agentic-ci.md).

- **Quality is the one real risk.** The free tier is Flash-class — weaker than Claude/Gemini-Pro at
  nuanced editorial judgement. It is acceptable here **because the Beat proposes and Davide ratifies**:
  the deterministic moves (`gh`, board, `notify`) are model-independent, the editorial calls arrive as
  a Telegram ping Davide can override (de-slot, relabel), and publishing is always manual
  (user story 26). The model is a well-instructed drafter/triager, not an autonomous decider.
- **Escape hatch.** Because the Beat prompts are model-agnostic, swapping to a stronger model (a
  free Gemini Pro tier if confirmed, a metered paid model, or a model-portable harness like opencode)
  is a change to this workflow only — the Beats don't move.
- **Data term.** Google may train on / human-review free-tier prompts
  (<https://ai.google.dev/gemini-api/terms>). Beat context is public editorial ideas + GitHub issues,
  so low-risk; keep anything sensitive out of the Beat context.

## Secrets (repo → Settings → Secrets and variables → Actions)

| Secret | What | Notes |
| ------ | ---- | ----- |
| `GEMINI_API_KEY` | Google AI Studio free key | aistudio.google.com → Get API key |
| `GH_PROJECT_PAT` | GitHub PAT (classic), scopes **`repo` + `project`** | the board is Projects v2; the built-in `GITHUB_TOKEN` lacks `project`. `gh` reads it via `GH_TOKEN`. Stored encrypted (unlike the routine env). |
| `TELEGRAM_BOT_TOKEN` | BotFather token | read by `contentos notify` |
| `TELEGRAM_CHAT_ID` | Davide's chat id | read by `contentos notify` |

## Testing / operating

- **Manual run:** Actions tab → *Content OS Beats* → *Run workflow* → pick the beat; or
  `gh workflow run beats.yml -f beat=monday`.
- **Read a run:** `gh run list --workflow beats.yml` then `gh run view <id> --log`.
- A healthy run promotes/slots per the Beat doc and delivers the Telegram ping; a misconfigured one is
  written to **stop and report** the missing prerequisite (see each Beat's Preconditions).
- The native routines created earlier are left **disabled** on claude.ai/code and can be deleted there.
