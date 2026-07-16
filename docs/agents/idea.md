# idea seam: the terminal capture door

`contentos idea create` is the **terminal capture door**: from any repo on the machine it files a
raw [Idea](../../CONTEXT.md) onto the [Pipeline](../../CONTEXT.md) in under thirty seconds, asking
**no format, channel, or quality question**. Capture first, judge later — the Monday planning
[Beat](../../CONTEXT.md) judges the idea afterwards (see the [pipeline taxonomy](pipeline-taxonomy.md)).
Davide has a spark → he runs `contentos idea create` → an `idea`-labeled issue lands on
`davideimola/content-os`, and he keeps working.

It is a subcommand of the `contentos` CLI (ADR-0003), and like the rest of the CLI it is **hands,
not brain**: it files the spark verbatim and never judges it. It is the CLI's first GitHub-touching
subcommand and, per [ADR-0004](../adr/0004-github-touching-subcommands-shell-out-to-gh.md), reaches
GitHub by shelling out to the `gh` CLI — so it inherits Davide's existing `gh` login and needs no
token of its own.

## Building the CLI

Same as the rest of `contentos` (see [notify.md](notify.md#building-the-cli)). Because the capture
door must be reachable from **every** repo, install it user-level once:

```sh
go install github.com/davideimola/content-os/cmd/contentos@latest
```

That puts `contentos` on `PATH` (via `$GOBIN`/`$GOPATH/bin`), so `contentos idea create` works from
any working directory. No compiled binaries are committed.

## Prerequisite: `gh`

The door shells out to the [GitHub CLI](https://cli.github.com/), which must be **installed and
authenticated** (`gh auth login`). It targets `davideimola/content-os` explicitly, so it files onto
the Pipeline no matter which repo you run it from — the current directory is never consulted.

## Usage

```sh
# spark as arguments
contentos idea create "The thing nobody tells you about running AI agents on real attacker traffic"

# or piped on stdin — paste a half-thought and go
pbpaste | contentos idea create
```

- The spark is the **arguments joined with spaces**, or **stdin** when there are none — mirroring
  `contentos notify`.
- Flag parsing is disabled, so a spark that begins with `-` passes through **verbatim**. For the
  command's own help, use `contentos help idea create`.
- The whole spark becomes the issue **body**, untouched. The **title** is a compact summary derived
  from the spark's first non-empty line, behind the Idea template's `[Idea] ` prefix so every idea
  reads uniformly in the tracker. The only label applied is `idea` — no format, channel, or quality
  decision at capture time.
- **No mandatory prompts** beyond the spark itself: the door never asks a follow-up question.
- On success the **new issue URL is printed to stdout** — one tap to the captured idea.
- **Exit status is the contract:** `0` means filed; non-zero means it was *not* filed, with a clear
  reason on stderr (`gh` failed, the spark was empty, …). The token/URL never carry a secret because
  `gh` owns the auth.

## Testing

- **Automated (no network, no `gh`, no auth):** `go test ./internal/idea/` (or the whole suite,
  `go test ./...`). The `gh` call is an **injected command runner** (`idea.Commander`), so the tests
  drive it against a fake that records the invocation and returns a canned URL. They cover the happy
  path from arguments and from stdin, the `[Idea] ` title derived from the first line, rune-safe
  title truncation, the empty/whitespace refusal (which must not reach `gh`), a stdin read error, a
  `gh` failure surfacing its own stderr, and that the body reaches `gh` verbatim.
- **Live smoke test (needs a real, authenticated `gh`):** from **any** directory run
  `contentos idea create "idea seam smoke test"`, confirm the URL it prints opens an `idea`-labeled
  issue on `davideimola/content-os`, then close that issue.
