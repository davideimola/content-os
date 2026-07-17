# The Beats run as GitHub Actions with a separated gather→decide→apply architecture, deciding with free Gemini

ADR-0002 built the Content OS as "a repo plus scheduled Claude routines", and ADR-0003 held that "the
Beats remain Claude routines" with GitHub Actions cron as a mere documented *fallback*. Building the
Beats reversed that. Two facts forced it: (1) a native Claude routine's cloud environment proxies
GitHub access to a pinned PR-review set and **cannot reach Projects v2** — the Calendar board every Beat
reads and writes; (2) running Claude *in* Actions instead would need an API key (per-token cost),
because subscription OAuth tokens are ToS-restricted to Claude Code / claude.ai — defeating ADR-0002's
zero-marginal-cost premise. We decided the **three Beats run on GitHub Actions cron**, and each is a
bash script with a **separated, non-agentic** shape: **GATHER** (deterministic `gh`) → **DECIDE** (one
Gemini REST call, JSON mode) → **APPLY** (deterministic bash: `gh` + a Telegram `curl`). The model is a
**pure function `state → decisions`**; every side effect is deterministic bash, with no agent tool-loop.
The single DECIDE step uses **free Google Gemini** (`gemini-flash-lite-latest`), not Claude.

## Considered Options

- **GitHub Actions + separated bash + one free-Gemini REST call** (chosen): full GitHub + Projects v2
  access, zero monetary cost, and — being entirely code (`beats.yml` + `scripts/beats/` + the beat docs
  as prompts) — reproducible and auditable. Costs a third-party model dependency and its free-tier quota.
- **Native Claude scheduled routines** (ADR-0002/0003's original choice): zero marginal cost on Davide's
  plan, but **rejected** — the routine environment can't reach Projects v2, so the Calendar (a hard
  requirement) is unreachable; and routines are server-side-only, not definable as code.
- **Claude in Actions via `claude-code-action` + an API key**: keeps Claude as the brain, but
  **rejected** — per-token API cost (subscription OAuth is ToS-restricted to Claude Code/claude.ai),
  against ADR-0002's zero-cost premise.
- **An agentic tool-loop in Actions** (e.g. `run-gemini-cli` with tool approval): **rejected** — the
  trust-directory / YOLO tool-approval setup was fragile in CI; a pure `state → decisions` function with
  a deterministic apply is simpler and safer.

## Consequences

- **Reverses ADR-0002 and ADR-0003 on the trigger.** The Beats are no longer Claude routines, and
  Actions is no longer a "fallback" — it is the primary and only mechanism. The "trigger is swappable /
  chosen separately / pending" framing in the beat docs is settled here.
- **The autonomous brain is Gemini, not Claude** — but only the Beats' one DECIDE step. The
  *interactive* surfaces (the [Desk](../../CONTEXT.md), the `/idea` skill) stay Claude.
  ADR-0002's "not software" spirit holds — no app, no server, no state; GitHub issues remain the single
  source of truth — but the autonomous judgement is now a third-party model call chosen for zero cost.
- **Availability shifts.** ADR-0002's "availability is bounded by Claude's scheduled-routine platform"
  no longer holds; it is now bounded by GitHub Actions and the Gemini free tier.
- **Quality risk, mitigated.** A Flash-Lite-class free model is weaker at nuanced editorial calls, but
  every Beat **proposes and Davide ratifies**: side effects are deterministic, the plan arrives as a
  Telegram ping he can override, and publishing is always manual (user story 26). Prompts are
  model-agnostic, so moving to a stronger model is a one-line `GEMINI_MODEL` change.
- **Operational constraints:** the Gemini free tier is ~20 `generateContent` requests/day *per model*
  (a real Beat makes one DECIDE call; heavy *testing* exhausts a day's quota — switch `GEMINI_MODEL` to
  iterate), and Google may train on / review free-tier prompts (Beat context is public editorial ideas +
  issues, so low-risk).
- **The separated shape is ADR-0003's hands/brain split inside one run:** GATHER and APPLY are hands
  (deterministic `gh` + bash), DECIDE is the only brain. Stages are independently runnable
  (`scripts/beats/<beat>.sh {gather|decide|apply|run}`) for debugging.
- Full operational detail lives in [`docs/agents/beat-scheduling.md`](../agents/beat-scheduling.md); the
  backing investigation is [`docs/research/zero-cost-agentic-ci.md`](../research/zero-cost-agentic-ci.md).
