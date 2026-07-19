# idea skill: the machine-side capture door

The `/idea` **Claude skill** is the **machine-side capture door**: from any repo on the machine Davide
files a raw [Idea](../../CONTEXT.md) onto the [Pipeline](../../CONTEXT.md) in seconds, asking **no
format, channel, or quality question**. Capture first, judge later — the Idea joins the live pool and is
judged afterwards in the [Desk](../../CONTEXT.md) (the Monday [Beat](../../CONTEXT.md) only reminds
Davide to open it; see the [pipeline taxonomy](pipeline-taxonomy.md)).
Davide has a spark → he runs `/idea <spark>` in Claude → a live Idea lands on the Content OS Pipeline
(Supabase), and he keeps working. Its sibling is the [AI-app door](app-capture.md), which files the
**same shape** by voice or text from the phone; the two share one invariant.

It **used to be** a `contentos` subcommand (`contentos idea create`). It moved to a skill because a good
title needs an LLM to distil the spark, and that judgement is "brain" — which belongs in a skill, not
the deterministic "hands, not brain" CLI ([ADR-0008](../adr/0008-idea-capture-door-is-a-claude-skill.md)).
It **used to** reach GitHub by shelling out to `gh`; since the source of truth moved to Supabase
([ADR-0014](../adr/0014-pipeline-source-of-truth-moves-to-supabase.md)) and operations became one MCP
adapter ([ADR-0015](../adr/0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md)), the
skill is now a **thin client** that calls the `capture_idea` tool of the `content-os-capture` MCP server
— no `gh`, no token of its own (the MCP server holds the shared capture token).

## Installing the skill

The skill is committed at `.claude/skills/idea/SKILL.md` as the **source of truth**. Because the capture
door must be reachable from **every** repo, install it user-level once:

```sh
make install-skills
```

That copies it to `~/.claude/skills/idea/`, so `/idea` is available in any Claude session, from any
working directory (a **personal** skill, where [`desk`](../../.claude/skills/desk/SKILL.md) is a project
skill scoped to content-os). Re-run `make install-skills` after editing the skill.

**The skill's `SKILL.md` must stay self-contained** — it runs from `~/.claude/skills/idea/`, detached
from this repo, so it carries **no repo-relative links** (`../../…` would resolve into the user's home
dir, not the repo). Everything the skill needs is inline; the repo docs and ADRs it relates to are named
as plain text, not linked.

## Prerequisite: the `content-os-capture` MCP server

The skill calls the **`capture_idea`** tool of the **`content-os-capture`** MCP server, which must be
configured **user-level** (in `~/.claude.json`'s top-level `mcpServers`) so it is present in every
Claude session regardless of the working directory. The server is the deployed capture door
(`supabase/functions/capture-mcp`), authenticated by the shared `CAPTURE_TOKEN` it holds — the skill
carries no token. The skill uses **only** `capture_idea`, never the adapter's other (privileged) tools.

## Usage

Invoke it in any Claude session with the spark:

```text
/idea The thing nobody tells you about running AI agents on real attacker traffic
```

Or just express the idea and let the skill capture it. It calls `capture_idea` once and replies with a
one-line confirmation carrying the new Idea id.

- The whole spark becomes the Idea **body** (`spark`), verbatim — nothing summarized, reformatted,
  translated, corrected, or added.
- The **title** is a short, readable summary of the idea's core (its thesis or subject), in the spark's
  own language, on one scannable line — the skill has an LLM, so it distils rather than truncates. The
  title is a handle, **not** a judgement.
- `source` is `"skill"`. No format, channel, or quality decision at capture time.
- **No follow-up question** beyond a missing spark: the door never asks whether it should be a blog post
  or which channel. Capture is the whole job.
- On success the **new Idea id** is the reply. It never pretends an idea was filed when it was not.

## The shape, and the sibling door

The skill and the [AI-app door](app-capture.md) file the **same invariant**: the spark stored **verbatim**
as the body, a **summarized** title (both have an LLM, so the two doors word the title differently for the
same spark — that is expected), and **no judgement** (no channel/format/quality). Keep the skill
(`.claude/skills/idea/SKILL.md`) and the AI-app door's capture instructions in `app-capture.md` in step:
if the shape ever changes in one, change it in the other.

## Testing

The door is a prompt, so it is verified by **driving it and asserting the resulting Idea** (the capture
seam), not by unit tests.

- **Drive-and-assert (the same-shape check):** capture a throwaway spark with `/idea`, then read the
  Idea back and assert its shape — the body is the spark verbatim, the title is a summary, `status` is
  `live`, and `source` is `skill`. Read it via the adapter's `list_ideas` tool, or against the DB in a
  local Supabase, and clean up the throwaway row afterwards.
