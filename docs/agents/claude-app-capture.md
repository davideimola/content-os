# Claude app capture door: voice or text, from any device

The Claude app is the second **capture door** onto the [Pipeline](../../CONTEXT.md), the sibling of
the terminal door ([`contentos idea create`](idea.md)). From the Claude app on any device — phone or
desktop — Davide **dictates or types** a raw [Idea](../../CONTEXT.md) and it lands as an
`idea`-labeled issue on `davideimola/content-os`, asking **no format, channel, or quality question**.
Capture first, judge later — the Monday planning [Beat](../../CONTEXT.md) judges it afterwards (see
the [pipeline taxonomy](pipeline-taxonomy.md)). Davide has a spark on his phone → he speaks it into
the Claude app → an `idea`-labeled issue lands on the Pipeline, and he puts the phone away.

This is deliberately **not** an app of its own ([ADR-0002](../adr/0002-no-app-repo-plus-claude-routines.md)):
the door is the Claude app Davide already carries, pointed at GitHub by a **connector** and steered by
a set of capture instructions committed here. There is no server and no new place to check — the same
"no software" principle that gives the terminal door its `gh` and gives the Beats their routines.

## One shape, two doors

An idea filed here must be **indistinguishable** from one filed by `contentos idea create` — same
issue, but for the number. That shape is the contract both doors honour:

| Facet | Value |
| --- | --- |
| Repo | `davideimola/content-os` (fixed, never inferred from anything) |
| Title | `[Idea] ` + the spark's **first non-empty line** copied as written, truncated to the terminal door's 72-character cap and ending in `…` if shortened — never paraphrased |
| Body | the spark **verbatim** — nothing summarized, reformatted, translated, corrected, or added |
| Label | `idea`, and nothing else — no channel, format, or Flag/Side at capture time |

The terminal door enforces this shape in Go (`internal/idea`); the Claude app door enforces it through
the capture instructions below. Keep the two in step: if the shape ever changes in one door, change it
in the other.

## One-time setup (requires Davide)

1. **Enable the GitHub connector.** In the Claude app, add the GitHub connector and authorize it for
   the `davideimola/content-os` repository, so Claude can create issues there. (This is the app-side
   equivalent of the terminal door's authenticated `gh` — [ADR-0004](../adr/0004-github-touching-subcommands-shell-out-to-gh.md).)
2. **Create a capture Project.** Make a Claude Project named e.g. **"Content OS — capture"**. A Project
   gives the door a permanent home: its custom instructions are always in force, so every capture is
   one message with no re-prompting.
3. **Paste the capture instructions.** Copy the block under
   [The capture instructions](#the-capture-instructions) verbatim into the Project's custom
   instructions. They are the contract that makes the app door match the terminal door.
4. **Pin it for one tap.** Put the Project (or a shortcut to it) somewhere reachable in one tap on the
   phone — the door is only as good as it is frictionless.

Setup is done once. After it, capturing is a single message.

## Capturing — voice or text

Open the capture Project in the Claude app and give it the spark:

- **By voice:** tap the microphone (or use voice mode) and just say the idea, then send. The
  transcript is the spark.
- **By text:** type or paste the spark and send.

Say the whole thought and stop — no title, no channel, no "should this be a blog post". Claude files
the issue and replies with **only the new issue URL**; that URL is the one tap to the captured idea.
It never asks a follow-up question: a captured raw idea is the whole job.

## The capture instructions

Paste this verbatim into the capture Project's custom instructions. It encodes the shape contract
above; do not soften it into asking questions or judging the idea.

```text
You are the Content OS capture door. Your only job is to file the idea Davide
just gave you — dictated or typed — as a raw Idea on his editorial Pipeline,
then get out of the way. Capture first, judge later: the Monday planning Beat
judges the idea, never you.

When Davide gives you an idea:

1. Create exactly one GitHub issue on the `davideimola/content-os` repository,
   using the GitHub connector.
2. Body: the idea exactly as he gave it — the dictation transcript or typed
   text, verbatim. Do not summarize, reformat, add headings, translate,
   correct, or comment. Add nothing of your own and remove nothing.
3. Title: "[Idea] " followed by the spark's first non-empty line, copied as
   written and truncated to at most 72 characters (end it with "…" if you
   truncate). Do not paraphrase or summarize the line — the same spark must
   yield the same title the terminal door would.
4. Labels: exactly `idea`, and nothing else. Do not add a channel, format,
   Flag/Side, or any other label.
5. Do not ask any follow-up question. Do not propose a channel, format, or
   quality judgement. Do not draft, expand, or improve the idea.
6. After the issue is created, reply with only its URL — nothing else.

If the idea is empty, or you could not create the issue, say so plainly on one
line. Never pretend an idea was filed when it was not.
```

## Testing

The door is a prompt seam, so it is verified by **driving it and asserting the resulting GitHub
state** (the tracker seam), not by unit tests — matching the spec's testing decisions for prompt
features.

- **Drive-and-assert (the same-shape check):** from the app, capture a throwaway spark, then read the
  issue back and assert its shape:

  ```sh
  gh issue view <n> --repo davideimola/content-os --json title,body,labels \
    --jq '{title, body, labels: [.labels[].name]}'
  ```

  It passes when the title starts with `[Idea] `, `labels` is exactly `["idea"]`, and the body is the
  spark you gave with nothing added. File the **same spark** through `contentos idea create` and
  confirm the two issues are indistinguishable but for the number — that is the "same shape"
  acceptance criterion made concrete.

- **Live smoke test (needs the phone):** dictate `claude app capture smoke test` from the Claude app
  on the phone, confirm the URL it replies with opens an `idea`-labeled issue on `davideimola/content-os`
  shaped as above, then close that issue. After this passes once, the Beats assume the door works.
