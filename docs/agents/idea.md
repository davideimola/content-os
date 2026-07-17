# idea skill: the machine-side capture door

The `/idea` **Claude skill** is the **machine-side capture door**: from any repo on the machine Davide
files a raw [Idea](../../CONTEXT.md) onto the [Pipeline](../../CONTEXT.md) in seconds, asking **no
format, channel, or quality question**. Capture first, judge later — the Monday planning
[Beat](../../CONTEXT.md) judges the idea afterwards (see the [pipeline taxonomy](pipeline-taxonomy.md)).
Davide has a spark → he runs `/idea <spark>` in Claude → an `idea`-labeled issue lands on
`davideimola/content-os`, and he keeps working. Its sibling is the [AI-app door](app-capture.md),
which files the **same shape** by voice or text from the phone; the two share one invariant.

It **used to be** a `contentos` subcommand (`contentos idea create`). It moved to a skill because a
good title needs an LLM to distil the spark, and that judgement is "brain" — which belongs in a skill,
not the deterministic "hands, not brain" CLI. See
[ADR-0008](../adr/0008-idea-capture-door-is-a-claude-skill.md). The skill still reaches GitHub by
shelling out to `gh` ([ADR-0004](../adr/0004-github-touching-subcommands-shell-out-to-gh.md)), so it
inherits Davide's existing `gh` login and needs no token of its own.

## Installing the skill

The skill is committed at `.claude/skills/idea/SKILL.md` as the **source of truth**. Because the
capture door must be reachable from **every** repo, install it user-level once:

```sh
make install-skills   # or `make setup` to also build + install the contentos CLI
```

That copies it to `~/.claude/skills/idea/`, so `/idea` is available in any Claude session, from any
working directory (a **personal** skill, where [`desk`](../../.claude/skills/desk/SKILL.md) is a
project skill scoped to content-os). Re-run `make install-skills` after editing the skill.

**The skill's `SKILL.md` must stay self-contained** — it runs from `~/.claude/skills/idea/`, detached
from this repo, so it carries **no repo-relative links** (`../../…` would resolve into the user's home
dir, not the repo). Everything the skill needs to file an idea is inline; the repo docs and ADRs it
relates to are named as plain text, not linked. (A project skill like `desk` may use repo-relative
links, because it only ever runs from inside its checkout — that difference is the whole reason this
one can't.)

## Prerequisite: `gh`

The skill shells out to the [GitHub CLI](https://cli.github.com/), which must be **installed and
authenticated** (`gh auth login`). It targets `davideimola/content-os` explicitly, so it files onto
the Pipeline no matter which repo the session is in — the current directory is never consulted.

## Usage

Invoke it in any Claude session with the spark:

```text
/idea The thing nobody tells you about running AI agents on real attacker traffic
```

Or just express the idea and let the skill capture it. It files exactly one issue and replies with
**only the new issue URL**.

- The whole spark becomes the issue **body**, verbatim — nothing summarized, reformatted, translated,
  corrected, or added.
- The **title** is `[Idea] ` + a short, readable summary of the idea's core (its thesis or subject),
  in the spark's own language, on one scannable line — the skill has an LLM, so it distils rather than
  truncates. The title is a tracker handle, **not** a judgement.
- The only label is `idea` — no format, channel, or quality decision at capture time.
- **No follow-up question** beyond a missing spark: the door never asks whether it should be a blog
  post or which channel. Capture is the whole job.
- On success the **new issue URL** is the reply — one tap to the captured idea. It never pretends an
  idea was filed when it was not.

## The shape, and the sibling door

The skill and the [AI-app door](app-capture.md) file the **same invariant**: the `[Idea] ` title
prefix, the verbatim body, and the lone `idea` label. Both now **summarize** the title (both have an
LLM), so the two doors word the title differently for the same spark — that is expected; only the
invariant is shared. Keep the skill (`.claude/skills/idea/SKILL.md`) and the AI-app door's capture
instructions in `app-capture.md` in step: if the shape ever changes in one, change it in the other.

## Testing

The door is a prompt, so it is verified by **driving it and asserting the resulting GitHub state**
(the tracker seam), not by unit tests.

- **Drive-and-assert (the same-shape check):** capture a throwaway spark with `/idea`, then read the
  issue back and assert its shape:

  ```sh
  gh issue view <n> --repo davideimola/content-os --json title,body,labels \
    --jq '{title, body, labels: [.labels[].name]}'
  ```

  It passes when the title starts with `[Idea] `, `labels` is exactly `["idea"]`, and the body is the
  spark you gave with nothing added.
