# GitHub-touching `contentos` subcommands shell out to `gh`

> **Refined by [ADR-0008](0008-idea-capture-door-is-a-claude-skill.md):** `idea`, the subcommand this
> ADR was decided for, is now a Claude skill. The skill still reaches GitHub through `gh`, so the `gh`
> decision below stands — it just no longer rides a `contentos` subcommand (none remain that touch
> GitHub). The injected-runner seam (`idea.Commander`) is gone with the package.

ADR-0003 built `contentos` as the operations surface over the Pipeline and explicitly deferred one question until it was first needed: whether the subcommands that touch GitHub (the Pipeline's home, ADR-0001) shell out to the `gh` CLI or embed a Go GitHub client. The capture door — `contentos idea create` (issue #5) — is the first such subcommand, so the decision is now due. We decided **`contentos` reaches GitHub by shelling out to `gh`**, not by embedding a GitHub client with its own token handling.

Why `gh`: the operations surface is **hands, not brain** (ADR-0003), and `gh` is exactly the dumb, well-tested hand for GitHub. It already owns authentication — on Davide's machine `gh` is installed and logged in, and the capture door runs there, from any repo — so the CLI inherits auth for free and honours the door's "under thirty seconds, no ceremony" promise. It matches the existing convention: `docs/agents/issue-tracker.md` already mandates `gh` for every GitHub operation, so the CLI and the skills touch GitHub the same one way. And it keeps the binary small: no GitHub SDK dependency, no token plumbing, no second client to keep in step with the API.

## Considered Options

- **Shell out to `gh`** (chosen): zero auth code, one consistent GitHub mechanism across the CLI and skills, a tiny testable seam (an injected command runner). Costs a runtime dependency on `gh` being installed and authenticated — true on dev machines, and a documented setup step for the routine VM.
- **Embed a Go GitHub client** (e.g. `go-github`): no external binary at runtime, works anywhere a token is present. Rejected for now — it pulls a GitHub SDK into a deliberately minimal binary, forces the CLI to manage a `GITHUB_TOKEN`/PAT itself (setup friction against the capture door's whole point), and diverges from the `gh`-everywhere convention the skills already follow.
- **A thin hand-rolled REST call**: rejected — it is the SDK's token and pagination burden without the SDK's correctness.

## Consequences

- **`gh` is a runtime dependency of the GitHub-touching subcommands.** On dev machines and in the Factories it is already present and authenticated. For any **Beat** that later calls such a subcommand from the routine VM, the routine's setup script must ensure `gh` is installed and authenticate it non-interactively via a `GH_TOKEN` routine secret — the same shape as the `TELEGRAM_*` secrets. (The capture door itself is a human terminal tool, not a Beat, so this only bites when a Beat first needs a GitHub write.)
- **The seam is an injected command runner** (`idea.Commander`): production shells out with `os/exec`; tests substitute a fake, so the subcommands are covered with no network, no auth, and no `gh` installed. Failures surface `gh`'s own stderr; exit status stays the contract, mirroring the notify and metrics-ingest seams.
- **The target repo is fixed in the binary** (`davideimola/content-os`), never inferred from the working directory — the door must file onto the Pipeline no matter which repo Davide runs it from.
- This resolves ADR-0003's deferred decision for GitHub writes. It does **not** reopen the "not software" principle: the CLI still only runs fixed operations and holds no state; `gh` is just how the hand reaches GitHub.
