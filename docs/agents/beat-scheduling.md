# Beat scheduling: GitHub Actions, separated runner, free model

The three [Beats](../../CONTEXT.md) run on **GitHub Actions cron**, not native Claude routines: the
routines' cloud env proxies GitHub access to a pinned PR-review set and **cannot reach Projects v2**
(the [Calendar board](calendar.md)), which every Beat needs. An Actions runner has full GitHub +
internet egress. See [the zero-cost research](../research/zero-cost-agentic-ci.md).

## Separated architecture (ADR-0003 hands/brain)

Each Beat is `scripts/beats/<beat>.sh` with three stages — the model is a **pure function**
`state → decisions`; every side effect is deterministic:

```
GATHER  (deterministic gh)                    → state JSON
DECIDE  (one Gemini REST call, JSON mode)     → decisions JSON   ← the only AI step, NON-agentic
APPLY   (deterministic gh + a Telegram curl)  → labels, board slots, one Telegram ping
```

The editorial **judgement** (signals, recycle/dry-week, cadence) lives in `docs/agents/<beat>-beat.md`;
the runner feeds that doc to the model as the decision prompt and executes only the JSON it returns.
No agent tool-loop — that fragility (trust dir, tool-approval) is why we left run-gemini-cli. Stages
are separately runnable for debugging: `scripts/beats/monday.sh {gather|decide <state>|apply <dec>|run}`.

## The workflow

[`.github/workflows/beats.yml`](../../.github/workflows/beats.yml): checkout → select the beat
(`github.event.schedule` → `monday`/`thursday`/`monthly`) → a deterministic prereq smoke-check →
`bash scripts/beats/<beat>.sh run`. Pure bash — `gh` + `curl` + `jq`, no Go build (ADR-0009). Also
`workflow_dispatch` (a `beat` input) for manual/test runs.

- **Monday** is live + verified end-to-end (cron `0 6 * * 1` ≈ 08:00 Europe/Rome summer). **Thursday**
  and **Monthly** crons are commented out until `scripts/beats/{thursday,monthly}.sh` land (only
  `monday.sh` exists so far); both stay runnable via `workflow_dispatch`.

## Model: free Google Gemini

Default **`gemini-flash-lite-latest`** via the Gemini REST API on a free Google AI Studio key.

- **Free-tier quota is small and per-model** — currently ~20 `generateContent` requests/day *per model*
  (observed 2026-07-17; `gemini-3.5-flash` = `gemini-flash-latest` hit that limit under test). A real
  Beat makes **one** decide call, so ~9 runs/month sits far inside it; heavy *testing* exhausts a day's
  quota, so switch `GEMINI_MODEL` to another model (separate bucket) when iterating.
- `GEMINI_MODEL` overrides the model. Decide retries transient `503` with backoff; a `429` (usually the
  daily quota) is retried once only, to avoid burning the small free quota.
- **Quality risk (mitigated):** a Flash-Lite-class free model is weaker at nuanced editorial calls, but
  the Beat **proposes and Davide ratifies** — side effects are deterministic, the plan arrives as a
  Telegram ping he can override, and publishing is always manual (user story 26). Because the prompts
  are model-agnostic, swapping to a stronger model is a one-line `GEMINI_MODEL` change.
- **Data term:** Google may train on / review free-tier prompts (<https://ai.google.dev/gemini-api/terms>);
  Beat context is public editorial ideas + issues, so low-risk.

## Secrets (repo → Settings → Secrets and variables → Actions)

| Secret | What | Notes |
| ------ | ---- | ----- |
| `GEMINI_API_KEY` | free Google AI Studio key | aistudio.google.com → Get API key; **do not enable billing** on its project → free tier, cannot be charged |
| `GH_PROJECT_PAT` | GitHub PAT (classic), scopes **`repo` + `project` + `read:org`** | `read:org` is required too — `gh project --owner <user>` needs it to resolve the owner (else "unknown owner type"). `gh` reads it via `GH_TOKEN`. |
| `TELEGRAM_BOT_TOKEN` | BotFather token | read by the notify seam (`notify_ping`) |
| `TELEGRAM_CHAT_ID` | Davide's chat id | read by the notify seam (`notify_ping`) |

## Testing / operating

- **Manual run:** Actions → *Content OS Beats* → *Run workflow* → pick the beat; or
  `gh workflow run beats.yml -f beat=monday`.
- **Read a run:** `gh run list --workflow beats.yml` → `gh run view <id> --log`. The prereq step and the
  Beat's own `echo`s (promote/slot/notify) make a run legible; the deterministic APPLY means outcomes
  are asserted on the tracker (`gh issue view`, `gh project item-list`), not inferred from an agent.
- The native routines created earlier are left **disabled** on claude.ai/code and can be deleted there.
