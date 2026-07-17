# The machine-side idea capture door is a Claude skill, not a `contentos` subcommand

ADR-0003 built `contentos` as the operations surface over the Pipeline — deterministic **hands, not
brain** — and ADR-0004 made `contentos idea create` its first GitHub-touching subcommand: the terminal
capture door. In use, that door's titles read badly. The Go door has no LLM, so it can only mechanically
truncate the spark's first non-empty line; a spark that opens with a rambling preamble
(e.g. [#41](https://github.com/davideimola/content-os/issues/41): *"Stavo pensando che poteva essere
carino produrre qualcosa per dire che…"*) yields a title useless for scanning the Idea inbox on Monday.

Making the title a **readable summary** needs judgement — you have to understand the idea to distil
it — and judgement is "brain", which ADR-0003 deliberately keeps out of the CLI. So the capture door
that wants a good title does not belong in `contentos` at all. That is the same realization from two
directions: the title complaint and "shouldn't this be a skill?" are one question.

We decided **the machine-side capture door moves from `contentos idea create` to a Claude skill**
(`/idea`), committed in the repo (`.claude/skills/idea/SKILL.md`) as the source of truth and installed
user-level (`make install-skills` → `~/.claude/skills/idea/`) so it is callable from **any** repo on the
machine — the same reach the CLI door had. The skill has an LLM, so it distils a readable `[Idea] `
title while filing the spark **verbatim** as the body with the lone `idea` label. It still reaches
GitHub through `gh` (ADR-0004 stands). The Go `idea` subcommand and `internal/idea` are retired.

This also **unifies the two capture doors**. The machine-side skill and the [AI-app door](0005-ai-app-capture-door-github-connector.md)
are now both LLM-backed prompt doors producing the same shape. The **shared invariant** is: body
verbatim, `idea` label only, and the `[Idea] ` title prefix. The title *text* is each door's own
wording of the same idea — a summary, not a captured artifact — so the doors may phrase it differently
while capturing the identical raw spark.

## Considered Options

- **Skill door; retire the CLI subcommand** (chosen): the title problem dissolves (the skill has an
  LLM), the "brain" lands where ADR-0003 says brain goes, the two doors unify on one prompt-driven
  shape, and the Go code + tests go away. Cost: machine-side capture now goes through a Claude session
  — but Davide is essentially always in one, and the phone is covered by the AI-app door.
- **Keep the dumb CLI *and* add a skill**: two machine-side doors, redundant surface to keep in step,
  and the CLI one keeps emitting bad titles. Rejected.
- **Keep the CLI, teach it to summarize the title**: puts an LLM call inside a "hands, not brain"
  deterministic tool — violates ADR-0003 and adds a model dependency to a tool whose value is being
  fast and deterministic. Rejected.

## Consequences

- **`internal/idea`, its tests, and the `idea` subcommand wiring in `cmd/contentos` are removed.**
  `contentos` keeps `notify`, `metrics-ingest`, and `open`. After this, **no `contentos` subcommand
  touches GitHub** — the `gh` reach moves entirely to the skill (and to any future Beat).
- **The capture skill lives at `.claude/skills/idea/SKILL.md`** (source of truth) and installs to
  `~/.claude/skills/idea/` via `make install-skills` (or `make setup`). It is a **personal** skill by design (global
  reach), where `desk` (ADR-0007) is a **project** skill scoped to content-os.
- **ADR-0004 stands, refined**: the skill shells out to `gh`, so the "reach GitHub via `gh`" decision
  still governs — it simply no longer rides a `contentos` subcommand. ADR-0004's injected-runner seam
  (`idea.Commander`) is gone with the package; the skill is a prompt, verified at the tracker seam.
- **ADR-0003's surface is refined, not reversed**: idea leaves the CLI; the "not software / hands, not
  brain" principle is untouched (the skill is a prompt, not hosted software).
- **Both doors are verified the same way** — drive-and-assert the resulting issue's shape at the
  tracker seam; no unit tests for either prompt. The "same shape" acceptance criterion is body verbatim
  + `idea` label + `[Idea] ` prefix; title text differs by door, by design.
- **Docs updated to match**: `docs/agents/idea.md` now documents the skill; `docs/agents/app-capture.md`,
  `docs/agents/pipeline-taxonomy.md`, and the CLAUDE.md capture-door sections are brought in step.
