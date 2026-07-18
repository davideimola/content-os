# AI-app capture door: voice or text, from any app with a GitHub connector

The second **capture door** onto the [Pipeline](../../CONTEXT.md), the sibling of the machine-side
[`/idea` skill](idea.md). From an AI app on the phone or desktop, Davide **dictates or
types** a raw [Idea](../../CONTEXT.md) and it lands as an `idea`-labeled issue on
`davideimola/content-os`, asking **no format, channel, or quality question**. Capture first, judge
later — it is judged afterwards in the [Desk](../../CONTEXT.md) (the Monday [Beat](../../CONTEXT.md)
only reminds Davide to open it; see the [pipeline taxonomy](pipeline-taxonomy.md)). Davide has a spark on his phone → he speaks it into the
app → an `idea`-labeled issue lands on the Pipeline, and he puts the phone away.

The door is **not tied to one vendor** ([ADR-0005](../adr/0005-ai-app-capture-door-github-connector.md)):
any AI app whose **GitHub connector can create issues** can be the door. **Perplexity is the verified
reference** (it filed [#18](https://github.com/davideimola/content-os/issues/18) on-shape during the
smoke test); the same setup works for any app that grows a write-capable GitHub connector. This
is deliberately **not** an app of our own ([ADR-0002](../adr/0002-no-app-repo-plus-claude-routines.md)):
the connector runs in the app vendor's cloud — a third-party service we use, like `gh` for the
`/idea` skill and the Telegram Bot API for `notify`, never a server we host.

## One shape, two doors

An idea filed here must carry the **same shape** as one filed by the [`/idea` skill](idea.md). The
**invariant** both doors honour is three facets: the `[Idea] ` title prefix, the **verbatim body**,
and the **`idea`-only label**. Both doors have an LLM, so both **summarize** the title into a readable
handle — they may word it differently for the same spark, and that is fine: the title is a scannable
tracker handle, not a captured artifact, and the raw spark survives verbatim in the body either way.

| Facet | Value |
| --- | --- |
| Repo | `davideimola/content-os` (fixed, never inferred from anything) |
| Title | `[Idea] ` + a short, readable summary of the idea's core (its thesis or subject), in the spark's own language, on one scannable line (aim for under ~70 characters). A tracker handle, **not** a judgement — never a channel, format, or quality call. Distilled, never a rambling first line copied verbatim |
| Body | the spark **verbatim** — nothing summarized, reformatted, translated, corrected, or added |
| Label | `idea`, and nothing else — no channel, format, or Flag/Side at capture time |

The `/idea` skill enforces this through its `SKILL.md`; the AI-app door enforces it through the
[capture instructions](#the-capture-instructions) below — those are the single source of shape truth
for this door, and they match what the [`idea` issue template](../../.github/ISSUE_TEMPLATE/idea.yml)
already encodes. Keep the two doors in step on the **invariant** (title prefix, verbatim body,
`idea`-only label): if it ever changes in one, change it in the other. The title *text* is each door's
own summary of the same idea ([ADR-0008](../adr/0008-idea-capture-door-is-a-claude-skill.md)).

## What an app needs to be the door

Any AI app qualifies when it has both:

1. **A write-capable GitHub connector** — one that can *create issues* on `davideimola/content-os`,
   not merely read them. A read-only connector cannot be the door.
2. **A home for reusable instructions** — a container the app applies to every session (Perplexity
   calls it a **Space**; other apps call it a Project, a GPT, or custom instructions). The
   [capture instructions](#the-capture-instructions) live there so every capture is one message with
   no re-prompting.

If an app has both, follow the Perplexity steps below, substituting that app's names for "Space" and
"connector".

## Setting up the door — Perplexity (verified)

1. **Enable the GitHub connector.** In Perplexity, Settings → Connectors, add the GitHub connector and
   authorize it for `davideimola/content-os` with permission to **create issues**. (This is the
   app-side equivalent of the `/idea` skill's authenticated `gh` — [ADR-0004](../adr/0004-github-touching-subcommands-shell-out-to-gh.md).)
2. **Create a capture Space.** Make a Perplexity Space named e.g. **"Content OS — capture"**. A Space
   applies its custom instructions to every thread inside it, so the door has a permanent home.
3. **Paste the capture instructions.** Copy the block under
   [The capture instructions](#the-capture-instructions) verbatim into the Space's custom
   instructions. They are the contract that makes this door match the `/idea` skill.
4. **Pin it for one tap.** Put the Space (or a shortcut to it) somewhere reachable in one tap on the
   phone — the door is only as good as it is frictionless.

Setup is done once. After it, capturing is a single message.

## Capturing — voice or text

Open the capture Space in the app and give it the spark:

- **By voice:** tap the microphone (or use voice mode) and just say the idea, then send. The
  transcript is the spark.
- **By text:** type or paste the spark and send.

Say the whole thought and stop — no title, no channel, no "should this be a blog post". The app files
the issue and replies with **only the new issue URL**; that URL is the one tap to the captured idea.
It never asks a follow-up question: a captured raw idea is the whole job.

## The capture instructions

Paste this verbatim into the capture Space's custom instructions (or the equivalent container in
whatever app you use). It encodes the shape contract above; do not soften it into asking questions or
judging the idea.

```text
You are the Content OS capture door. Your only job is to file the idea Davide
just gave you — dictated or typed — as a raw Idea on his editorial Pipeline,
then get out of the way. Capture first, judge later: the idea is judged later in
the Desk, never by you.

When Davide gives you an idea:

1. Create exactly one GitHub issue on the `davideimola/content-os` repository,
   using your GitHub connector.
2. Body: the idea exactly as he gave it — the dictation transcript or typed
   text, verbatim. Do not summarize, reformat, add headings, translate,
   correct, or comment. Add nothing of your own and remove nothing.
3. Title: "[Idea] " followed by a short, readable summary of what the idea
   is about — its core thesis or subject, in the same language as the spark,
   on one scannable line (aim for under ~70 characters). Distil it: never copy
   a rambling opening line verbatim. The title is only a handle for the
   tracker, not a judgement — capture the subject, never rate the idea or pick
   a channel, format, or Flag/Side.
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
  spark you gave with nothing added. File the **same spark** through the [`/idea` skill](idea.md) and
  confirm the two issues carry the same **invariant** — the `[Idea] ` prefix, the verbatim body, and
  the lone `idea` label. The title **text** will differ, and that is expected: both doors summarize
  the idea into a readable handle in their own words. Assert the invariant, not title equality — that
  is the "same shape" acceptance criterion made concrete. (The Perplexity reference smoke test filed
  [#18](https://github.com/davideimola/content-os/issues/18), validating this door at the tracker seam.)

- **Live smoke test (needs the phone):** dictate `app capture smoke test` from the app on the phone,
  confirm the URL it replies with opens an `idea`-labeled issue on `davideimola/content-os` shaped as
  above, then close that issue. Re-run this once per app you set up as a door; after it passes, the
  Beats assume the door works.
