# No app: the Content OS is a repo plus Claude routines

> **Amended by [ADR-0003](0003-contentos-cli-operations-surface.md):** the Telegram bot is no longer the only custom-built piece — it becomes the `notify` subcommand of the `contentos` CLI. The "not software" principle stands, refined: content-os grows exactly one deterministic, stateless CLI (hands, not brain), never an app that thinks or holds state.

The Content OS could have been a web app (Vercel/Supabase free tier dashboard). We decided it is deliberately **not** software: a git repo (issues, CONTEXT.md, metrics files, a GitHub Projects board) operated by Claude Code skills and scheduled Claude routines ("Beats"), with a Telegram bot for outbound pings as the only custom-built piece (send-only, no server).

The reasons: Davide's stated failure mode is motivation and consistency, not missing software — every new tool is one more place *not* to go (see his own post "I Built a Tool I Don't Use", 2026-07); his Claude plan already includes scheduled routines, so the always-alive behaviour costs zero infra; and the writing skills that already work live in repos, so the HQ composes with them natively.

## Consequences

- If a visual dashboard is ever wanted, it must be additive (read-only over the same issues/board), never a second source of truth.
- The system's availability is bounded by Claude's scheduled-routine platform; there is no self-hosted fallback by design.
