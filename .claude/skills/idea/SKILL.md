---
name: idea
description: Capture a raw content spark onto the Content OS Pipeline as an `idea`-labeled GitHub issue on davideimola/content-os, from any repo. Use when Davide wants to jot down a content idea or spark and file it fast — capture first, judge later.
---

# idea — the capture door

File the spark Davide just gave you as a raw Idea on his editorial Pipeline — the GitHub issues on
`davideimola/content-os` — then reply with its URL. **Capture first, judge later**: your whole job is
to file the spark faithfully, and the Monday planning Beat judges it afterwards. File it as-is and add
nothing of your own — no channel, no format, no quality verdict, no draft or rewrite.

The **spark** is whatever Davide gave you with the invocation — the words after `/idea`, or the idea
he just expressed. With no spark, ask for it in one line and stop.

Create one GitHub issue via `gh` (installed and authenticated — `gh` owns the auth, no token here):

```sh
gh issue create \
  --repo davideimola/content-os \
  --title "[Idea] <short readable summary>" \
  --body "<the spark, verbatim>" \
  --label idea
```

- **Repo** — always `davideimola/content-os`, fixed; ignore the current repo.
- **Body** — the spark **verbatim**: copy it exactly, typos and all.
- **Title** — `[Idea] ` + a short, readable summary of the idea's core (its thesis or subject), in the
  spark's language, on one scannable line (aim for under ~70 characters). This is the one place you
  rephrase — and even here you name the topic, never rate it.
- **Label** — `idea`, alone.

Reply with **only** the new issue URL. If it could not be created, say exactly that on one line.

---

_Self-contained on purpose: installed to `~/.claude/skills/idea/` and run from any repo, so it holds
no repo-relative links. Source of truth and provenance live in the `davideimola/content-os` repo
(`docs/agents/idea.md`, ADR-0008); keep it in step with the AI-app capture door
(`docs/agents/app-capture.md`) — both encode the same shape._
