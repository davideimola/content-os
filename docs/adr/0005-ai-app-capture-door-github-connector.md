# The AI-app capture door is any app with a write-capable GitHub connector

The parent spec (#1) and its first user story assume Davide can "dictate a raw idea to the Claude app
from my phone and have it land as an Idea issue on content-os". Issue #6 is that door. Building it, we
hit a wall: **the Claude app has no working way to create a GitHub issue.** There is no first-party
GitHub connector; GitHub's official remote MCP server (`https://api.githubcopilot.com/mcp`) can be
registered as a *custom* connector, but it needs OAuth through a registered GitHub App that the
consumer app's connector flow does not support, and even when connected the issue-*creation* tools are
not reliably surfaced to the model. GitHub's own install guide covers Claude Code, Desktop, and Xcode
— not the web or mobile app. So this door needs its own "how does it reach GitHub" decision, the
analogue of ADR-0004 for the CLI.

We decided **the door is any AI app whose GitHub connector can create issues — not a specific vendor.
Perplexity is the reference implementation**, verified end-to-end (it filed
[#18](https://github.com/davideimola/content-os/issues/18) with the right shape: `[Idea] ` +
first-line title, verbatim body, `idea` label only — a prompt approximates the terminal door's exact
title truncation, so the cut point may differ, which is cosmetic). The door reaches GitHub through the app's own GitHub connector,
running in the app vendor's cloud — a third-party service we *use*, exactly like `gh` for the terminal
door (ADR-0004) and the Telegram Bot API for `notify`, never a server we host.

Why generalize rather than name one app: the capability we depend on is "an AI app that can create a
GitHub issue from a dictated spark", not any one product's UI. We already had to pivot once (the spec's
assumed Claude app does not work today), so coupling the Pipeline to a single volatile vendor is a
liability. The portable part — the **shape contract** and the **capture instructions** — is what makes
an idea from this door carry the same shape as a terminal one; any app with a write-capable GitHub
connector and a place to hold reusable instructions can honour it.

## Considered Options

- **Any AI app with a write-capable GitHub connector; Perplexity as the verified reference** (chosen):
  no new software, uses tools Davide already pays for, works from the phone by voice, and is not
  hostage to one vendor. Costs: the shape is enforced by a prompt, not code (mitigated by the
  drive-and-assert test at the tracker seam), and each app must be smoke-tested once.
- **Stay on the Claude app via a custom remote MCP connector**: rejected for now — OAuth and
  issue-creation are not supported in the consumer app today, so it does not work. Revisit if the
  Claude app ships a write-capable GitHub connector; it then simply becomes another qualifying app
  under this ADR, no redesign needed.
- **A phone Shortcut → GitHub REST API** (voice-triggered, fine-grained PAT): a robust fallback that
  needs no AI app at all and produces a deterministic shape. Kept in reserve, not the primary — it is
  not an AI voice door and puts a PAT on the phone. Documentable later if the AI-app path regresses.
- **A hosted bridge or our own MCP server**: rejected — it is precisely the "software we build and
  host" that ADR-0002 rules out.

## Consequences

- **The door's contract is app-agnostic** and lives in `docs/agents/app-capture.md`: repo fixed to
  `davideimola/content-os`, title `[Idea] ` + the spark's first non-empty line (truncated to the
  terminal door's cap), body verbatim, `idea` label only. Adding a new app means enabling a
  write-capable GitHub connector and pasting the capture instructions into that app's reusable-prompt
  container (a Perplexity Space, a Project, a GPT).
- **No new hosted component.** The connector runs in the vendor's cloud; this stays inside ADR-0002 —
  we use third-party services, we do not build or host an app.
- **Verification stays at the tracker seam**: drive the door and assert the resulting issue's shape,
  plus a per-app phone live smoke test. No unit tests — it is a prompt seam (the spec's testing
  decision for prompts).
- **This refines the parent spec's "Claude app" wording**: the capability, not the vendor, is the
  requirement. The two capture doors — terminal (ADR-0004) and AI-app (this ADR) — still produce the
  same issue shape and must be kept in step if that shape ever changes.
