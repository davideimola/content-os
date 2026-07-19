---
name: idea
description: Capture a raw content spark onto the Content OS Pipeline via the content-os MCP capture tool, from any repo. Use when Davide wants to jot down a content idea or spark and file it fast — capture first, judge later.
---

# idea — the capture door

File the spark Davide just gave you as a raw Idea on his editorial Pipeline (Content OS on Supabase),
then confirm. **Capture first, judge later**: your whole job is to file the spark faithfully; it is
judged later in the Desk. File it as-is and add nothing of your own — no channel, no format, no quality
verdict, no draft or rewrite.

The **spark** is whatever Davide gave you with the invocation — the words after `/idea`, or the idea he
just expressed. With no spark, ask for it in one line and stop.

Call the **`capture_idea`** tool of the **`content-os-capture`** MCP server (configured user-level, so it
works from any repo). Use **only** this tool — never any other tool on that server:

- **`spark`** — the spark **verbatim**: copy it exactly, typos and all. It is stored as the Idea body.
- **`title`** — a short, readable summary of the idea's core (its thesis or subject), in the spark's
  language, one scannable line (aim under ~70 chars). This is the one place you rephrase — and even here
  you name the topic, never rate it.
- **`source`** — `"skill"`.

On success the tool returns the new Idea id; reply with **only** a one-line confirmation carrying it
(e.g. `Captured idea idea_…`). If it fails, say exactly that on one line.

---

_Self-contained on purpose: installed to `~/.claude/skills/idea/` and run from any repo, so it holds no
repo-relative links. The `content-os-capture` MCP server must be configured user-level (it is). Source of
truth and provenance live in the `davideimola/content-os` repo (`docs/agents/idea.md`, ADR-0008 for the
skill door + ADR-0015 for the MCP adapter); keep it in step with the AI-app capture door — both encode
the same shape (spark verbatim, a summarized title, no judgement)._
