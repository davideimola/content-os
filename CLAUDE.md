# content-os

## Agent skills

### Issue tracker

Issues are tracked on GitHub Issues (`davideimola/content-os`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Pipeline taxonomy

The Pipeline's labels. State (mutually exclusive): `idea` → `proposed` → `slotted` → `in-production` → `published`. Dimensions: `flag`/`side`, channels `blog`/`linkedin`/`talk`, and `cfp`. Idea and CFP capture use the issue templates in `.github/ISSUE_TEMPLATE/`. See `docs/agents/pipeline-taxonomy.md`.

### Calendar

The by-date view over the Pipeline: a GitHub Projects (v2) board on `davideimola/content-os`, owned by user `davideimola`, titled `Content OS — Calendar`. Issues stay the source of truth (ADR-0001); the board adds a `Date` field (publish date / deadline — the Calendar's spine) and a `Stage` single-select field that mirrors the state label 1:1 (options are the exact label strings `idea`/`proposed`/`slotted`/`in-production`/`published`) so a board layout can show state-based columns — label wins if they disagree. Three views: `Pipeline` (board grouped by `Stage`), `This week` (by `Date`), and `Talks & CFP` (talks/CFP share this one board). Maintained by the Beats via `gh project` CLI recipes (add / date / move / this-week query); creation needs the `project` OAuth scope (`gh auth refresh -s project`). Hands, not brain (ADR-0003); folding the ops into a `contentos` subcommand is a later slice. Verified at the tracker seam — slot a test issue with a date, assert it lands in the week view — no unit tests. See `docs/agents/calendar.md`.

### notify seam

`contentos notify "text"` is the single send-only command every Beat uses to ping Davide on Telegram — the first subcommand of the `contentos` Go CLI (ADR-0003), wrapping the Telegram Bot API; no server. Reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from the environment (secrets, never committed). Exit 0 = delivered; non-zero = clear error on stderr. Build with `go install github.com/davideimola/content-os/cmd/contentos@latest` (or `go run ./cmd/contentos`). Tests: `go test ./...`. See `docs/agents/notify.md`.

### idea seam

`contentos idea create` is the terminal capture door: from any repo on the machine it files a raw Idea onto the Pipeline in under 30s, asking no format, channel, or quality question — the whole spark becomes the issue body, a summary of its first line becomes the `[Idea] ` title, and the only label is `idea` (capture first, judge later; the Monday planning Beat judges it). The spark is the arguments joined with spaces, or stdin when there are none; flag parsing is disabled so it passes through verbatim. It is the CLI's first GitHub-touching subcommand and shells out to `gh` (ADR-0004), which must be installed and authenticated; it targets `davideimola/content-os` explicitly, never the cwd. On success it prints the new issue URL; exit 0 = filed, non-zero = clear error on stderr. Install user-level with `go install github.com/davideimola/content-os/cmd/contentos@latest`. Tests: `go test ./...` (the seam's `gh` call is an injected runner, so no network/auth needed). See `docs/agents/idea.md`.

### AI-app capture door

The second capture door onto the Pipeline — the sibling of the terminal `contentos idea create`. From an AI app on phone or desktop, Davide dictates or types a raw Idea and it lands as an `idea`-labeled issue on `davideimola/content-os`, carrying the same shape as one filed via the terminal door: `[Idea] ` + first-non-empty-line title, spark verbatim as body, only the `idea` label (a prompt approximates the exact title truncation). Not tied to one vendor (ADR-0005): any AI app with a **write-capable GitHub connector** can be the door — **Perplexity is the verified reference** (it filed #18 on-shape). It is not an app of our own (ADR-0002) — the connector runs in the vendor's cloud, a third-party service like `gh`, steered by committed capture instructions that encode the same shape the Go door enforces (`internal/idea`); keep the two in step. No format/channel/quality decision at capture time (capture first, judge later; the Monday planning Beat judges it). Verified at the tracker seam — drive it and assert the issue's shape — plus a per-app phone live smoke test; no unit tests for the prompt. See `docs/agents/app-capture.md`.

### metrics-ingest seam

`contentos metrics-ingest` turns the raw monthly inputs into normalized, versioned plain-text files under `metrics/<YYYY-MM>/`; the monthly review reads only the normalized form. Two paths: `metrics-ingest linkedin --file <csv> --month YYYY-MM` (a per-post export CSV → `linkedin-posts.csv`) and `metrics-ingest site --month YYYY-MM --visitors N --page-views N` (manual numbers → `site.csv`). Deterministic and idempotent — re-running on the same input is byte-identical. Hands, not brain (ADR-0003): producing the LinkedIn CSV from the raw export is the review Beat's job. Tests: `go test ./...` (the golden-sample test lives in `internal/metrics`). See `docs/agents/metrics-ingest.md`.

### Domain docs

Single-context: `CONTEXT.md` + ADRs in `docs/adr/` at the repo root. See `docs/agents/domain.md`.
