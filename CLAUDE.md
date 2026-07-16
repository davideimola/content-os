# content-os

## Agent skills

### Issue tracker

Issues are tracked on GitHub Issues (`davideimola/content-os`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Pipeline taxonomy

The Pipeline's labels. State (mutually exclusive): `idea` → `proposed` → `slotted` → `in-production` → `published`. Dimensions: `flag`/`side`, channels `blog`/`linkedin`/`talk`, and `cfp`. Idea and CFP capture use the issue templates in `.github/ISSUE_TEMPLATE/`. See `docs/agents/pipeline-taxonomy.md`.

### notify seam

`bin/notify "text"` is the single send-only command every Beat uses to ping Davide on Telegram (wraps the Telegram Bot API; no server). Reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from the environment (secrets, never committed). Exit 0 = delivered; non-zero = clear error on stderr. Tests: `bash test/run.sh`. See `docs/agents/notify.md`.

### Domain docs

Single-context: `CONTEXT.md` + ADRs in `docs/adr/` at the repo root. See `docs/agents/domain.md`.
