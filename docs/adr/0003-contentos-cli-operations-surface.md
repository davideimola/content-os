# The Content OS operations surface is a Go CLI (`contentos`)

> **Amended by [ADR-0008](0008-idea-capture-door-is-a-claude-skill.md):** the idea capture door leaves
> the CLI and becomes a Claude skill (`/idea`) — summarizing a title is "brain", which belongs in a
> skill, not the hands-only CLI. `contentos` keeps `notify`, `metrics-ingest`, and `open`; the
> "hands, not brain" principle stands.

Before this decision the only custom-built piece was `bin/notify`, a bash script wrapping the Telegram Bot API (ADR-0002). But the editorial pipeline is centralized on content-os (ADR-0001), so skills in the Factories (`davideimola.dev`, `presentations`) increasingly need to run the same deterministic operations against it — create an idea, query the Pipeline, read analytics — and today that means each Factory references skills living in another repo, which is fragile and duplicative. We decided content-os grows exactly one custom-built piece: **`contentos`, a Go CLI** that is the single, shared, deterministic operations surface. It is **hands, not brain**: it runs fixed operations over the Pipeline (GitHub issues) and never embeds AI nor holds its own state — the skills and Claude routines stay the intelligence, the GitHub issues stay the single source of truth (ADR-0001). `bin/notify` is retired; `notify` becomes its first subcommand (`contentos notify`).

Why Go: it is Davide's strongest language (maintainable for him, unlike the bash he only tolerates), and it compiles to a single binary that other repos install with `go install github.com/davideimola/content-os/cmd/contentos@latest` and that Claude can call as a tool — turning the messy cross-repo skill reference into one versioned, shared command.

## Considered Options

- **A Go CLI, dumb data-plane** (chosen): one shared, versioned, testable binary across repos; the intelligence stays in the skills. Costs a build step and a toolchain, but Go is preinstalled in the routine environment and present on dev machines, so the cost is near zero.
- **Keep per-operation bash scripts** (status quo): zero toolchain, but no cross-repo reuse (each Factory re-references content-os skills), weak testing, and a language Davide does not want to maintain.
- **A CLI that orchestrates AI** (calls Claude/Perplexity internally to generate content): rejected — it inverts the architecture (two brains), duplicates prompt/model management, and is exactly the "tool I don't use" ADR-0002 guards against. The CLI writes results; the skills think.

## Consequences

- ADR-0002's "the Telegram bot … is the only custom-built piece" no longer holds: the custom piece is now the `contentos` CLI, of which the Telegram ping is one subcommand. The **"not software" principle stands, refined**: content-os grows exactly one deterministic, stateless CLI — never an app that thinks or owns state, never a second source of truth.
- **`bin/notify` is retired.** The Beats and every caller invoke `contentos notify` (message from arguments or stdin; exit status is the contract; the token never leaks). The seam's *contract* is preserved; only the invocation path changes, once, for a few callers. `docs/agents/notify.md` and the CLAUDE.md "notify seam" section are updated when the subcommand lands, not before — so no doc describes a command that does not yet exist.
- **Distribution: no compiled binaries are committed.** Dev machines and Factories use `go install`; the Beats' routine VM (Go preinstalled, repo cloned) builds/runs from source via its setup script.
- **Beats remain Claude routines** (ADR-0002 unchanged). Because the operations live in `contentos` + skills — both portable — the trigger is swappable: **GitHub Actions cron → Claude is the documented fallback** if the research-preview routine platform proves unreliable. Routines are not definable as code today (server-side only); reproducibility comes from committing the Beat prompt, its setup script, and the CLI, plus a documented `/schedule` recreate step.
- **Deferred (decided when first needed):** whether GitHub-touching subcommands shell out to `gh` (not preinstalled in the routine VM) or use a Go GitHub library, and the subcommand set beyond `notify`.
