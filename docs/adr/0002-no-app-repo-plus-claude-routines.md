# No app: the Content OS is a repo plus Claude routines

> **Amended by [ADR-0003](0003-contentos-cli-operations-surface.md):** the Telegram bot is no longer the only custom-built piece — it becomes the `notify` subcommand of the `contentos` CLI. The "not software" principle stands, refined: content-os grows exactly one deterministic, stateless CLI (hands, not brain), never an app that thinks or holds state.
>
> **Further amended by [ADR-0009](0009-contentos-narrows-to-local-surface.md):** the Telegram ping is no longer a custom-built piece at all — `notify` leaves the `contentos` CLI and returns to the Beats as inline `curl` in `scripts/beats/lib.sh`. The "not software" principle is unchanged; the outbound ping is now a few lines of bash inside the (GitHub Actions) Beat, not a subcommand.
>
> **Further amended by [ADR-0010](0010-beats-run-as-github-actions-not-claude-routines.md):** the Beats are no longer scheduled *Claude* routines — they run as GitHub Actions cron, deciding with free Gemini (not Claude). The "not software" principle stands (no app, no server, no state); the system's availability is now bounded by GitHub Actions + the Gemini free tier, not Claude's routine platform.
>
> **Amended by [ADR-0016](0016-management-web-ui-writes-through-the-rpc-contract.md):** the "read-only dashboard" consequence below is relaxed — a management web UI (`content-os-web`) may **write**, provided it writes **only through the RPC contract** (ADR-0015). The invariant this ADR actually guards — *never a second source of truth* — stands: Supabase remains the one source, the RPC verbs the one write path, and the UI holds no logic of its own.

The Content OS could have been a web app (Vercel/Supabase free tier dashboard). We decided it is deliberately **not** software: a git repo (issues, CONTEXT.md, metrics files, a GitHub Projects board) operated by Claude Code skills and scheduled Claude routines ("Beats"), with a Telegram bot for outbound pings as the only custom-built piece (send-only, no server).

The reasons: Davide's stated failure mode is motivation and consistency, not missing software — every new tool is one more place *not* to go (see his own post "I Built a Tool I Don't Use", 2026-07); his Claude plan already includes scheduled routines, so the always-alive behaviour costs zero infra; and the writing skills that already work live in repos, so the HQ composes with them natively.

## Consequences

- If a visual dashboard is ever wanted, it must be additive (read-only over the same issues/board), never a second source of truth.
- The system's availability is bounded by Claude's scheduled-routine platform; there is no self-hosted fallback by design.
