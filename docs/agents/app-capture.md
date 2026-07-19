# AI-app capture door: voice or text, from a phone or desktop app

The second **capture door** onto the [Pipeline](../../CONTEXT.md), the sibling of the machine-side
[`/idea` skill](idea.md). From an AI app on the phone or desktop, Davide **dictates or types** a raw
[Idea](../../CONTEXT.md) and it lands on the Content OS Pipeline (Supabase), asking **no format, channel,
or quality question**. Capture first, judge later — it is judged afterwards in the
[Desk](../../CONTEXT.md) (the Monday [Beat](../../CONTEXT.md) only reminds Davide to open it). Davide has
a spark on his phone → he speaks it into the app → a live Idea lands on the Pipeline, and he puts the
phone away.

The door is **not tied to one vendor** ([ADR-0005](../adr/0005-ai-app-capture-door-github-connector.md)):
any AI app that can reach a Content OS **capture endpoint** — over MCP or a REST action — can be the
door. It is deliberately **not** an app of our own ([ADR-0002](../adr/0002-no-app-repo-plus-claude-routines.md)):
the connector runs in the app vendor's cloud — a third-party service we use, like `gh` was for the
`/idea` skill and the Telegram Bot API is for `notify`, never a server we host. Since ADR-0014/0015 the
target is the Supabase capture door, not a GitHub connector.

## One shape (the invariant)

An idea filed here carries the **same invariant** as one filed by the [`/idea` skill](idea.md): the
**spark verbatim** as the body, a **summarized title**, and **no judgement**. Both doors have an LLM, so
both word the title differently for the same spark — that is fine; the raw spark survives verbatim.

| Facet | Value |
| --- | --- |
| Body (`spark`) | the spark **verbatim** — nothing summarized, reformatted, translated, corrected, or added |
| `title` | a short, readable summary of the idea's core (thesis or subject), in the spark's own language, one scannable line (aim under ~70 chars). A handle, **not** a judgement — never a channel, format, or quality call |
| `source` | the app it came from (e.g. `perplexity`, `chatgpt`) |

There is **no label and no `[Idea]` prefix** anymore — those were GitHub-issue artifacts; the Supabase
Idea is a row with `status = live`, a body, a title, and a source. Keep this door and the `/idea` skill
in step on the invariant: if it changes in one, change it in the other. The
[capture instruction](#the-capture-instruction) below is the **single source of shape truth** for this
door.

## Two doors, by app

Both authenticate with the shared `CAPTURE_TOKEN`; exact endpoints, headers, and setup are in the
[runbook](../supabase-setup.md#5-capture-doors).

- **ChatGPT → the REST `capture-idea` endpoint as a Custom GPT Action.** This is the **insert-only**
  door (anon key, only the `capture_idea` RPC) — a leaked token inserts one Idea and nothing more.
  Enforced, so it's the safe pick for a capture-only GPT. Give the GPT an Action whose OpenAPI schema
  posts `{spark, title?, source?}` to the endpoint with the token header.
- **Perplexity → the `content-os-capture` MCP connector.** Perplexity speaks MCP; add the connector and
  it lists `capture_idea`. ⚠️ That server is now the **full operations adapter** (all verbs), so the
  connector exposes more than capture; the instruction says **use only `capture_idea`** — that is not
  enforced, the accepted trade-off of "one MCP, one token, no gates" (ADR-0015). If you ever want capture
  *enforced* insert-only over MCP too, that needs a separate insert-only endpoint.

## Phone door without a connector — an iOS Shortcut (no paid AI tier)

Consumer apps often gate a **custom MCP/connector behind a paid tier** (Perplexity's connectors, Claude's
custom connectors = Team, ChatGPT Actions/GPTs = Plus). When that blocks you, the phone door is a native
**iOS Shortcut** that POSTs to the **insert-only** REST `capture-idea` endpoint — no subscription, no
connector, Siri- or tap-triggered. Apple Intelligence supplies the title (optional and free on a recent
iPhone); the transport is just an HTTP request.

Build it once (Shortcuts app → new shortcut):

1. **Dictate Text** (or *Ask for Input* — "What's the idea?"). → the spark.
2. *(optional, needs Apple Intelligence)* **Use Model** / ChatGPT action, prompt: *"Summarize as a short
   one-line title — the idea's thesis or subject, same language, under 70 chars, no quotes:"* + the
   Dictated Text. → the title. **Set the action's output type to Text** (not Automatic/Dictionary) —
   otherwise the result won't serialize into the JSON `title` and it lands empty.
3. **Get Contents of URL**:
   - **URL:** `https://<project-ref>.supabase.co/functions/v1/capture-idea`
   - **Method:** POST
   - **Headers:** `content-type` = `application/json` · `x-capture-token` = `<CAPTURE_TOKEN>`
   - **Request Body:** JSON → `spark` = *Dictated Text*, `title` = the model's title (omit this key if you
     skip step 2), `source` = `ios-shortcut`
4. *(optional)* **Get Dictionary Value** `id` from the response → **Show Notification** with it.

Name it "Capture idea", add it to the Home Screen and/or "Hey Siri, capture idea". The `CAPTURE_TOKEN`
lives in the Shortcut on your device — the insert-only token, low stakes. Exact project-ref, endpoint, and
token are in the [runbook](../supabase-setup.md#5-capture-doors).

There is **no auto-import file**: iOS shares shortcuts via iCloud links made in the app, and hand-crafted
`.shortcut` files don't import reliably — build it once from the steps above. On Android, any HTTP-request
automation (Tasker, an HTTP-shortcut app) POSTing the same request is the equivalent.

## What an app needs to be the door

1. **A reach to a capture endpoint** — an MCP connector to `content-os-capture`, or a Custom Action /
   OpenAPI action to the REST `capture-idea` endpoint. (A GitHub connector is no longer the mechanism.)
2. **A home for reusable instructions** — a container the app applies to every session (Perplexity's
   **Space**, ChatGPT's **Custom GPT** instructions, or the equivalent). The
   [capture instruction](#the-capture-instruction) lives there so every capture is one message.

## The capture instruction

Paste this **verbatim** into the app's instructions container (Perplexity Space / ChatGPT GPT). It is
this door's shape contract — thin on purpose (the `capture_idea` tool/action carries the rest); do not
expand it into asking questions or judging the idea. It is a **different text** from the `/idea` skill by
design — they share the invariant, not the wording.

```text
You are the Content OS capture door. Your only job is to file the idea Davide
just gave you — dictated or typed — onto his editorial Pipeline, verbatim, then
get out of the way. Capture first, judge later: it is judged later in the Desk,
never by you.

When Davide gives you an idea, call the `capture_idea` tool/action once, and no
other tool:
- spark: the idea exactly as he gave it — the dictation transcript or typed
  text, verbatim. Do not summarize, reformat, translate, correct, or add
  anything; remove nothing.
- title: a short, readable summary of what the idea is about — its core thesis
  or subject, in the same language as the spark, one scannable line (aim under
  ~70 characters). A handle for the tracker, never a judgement — never a
  channel, format, or quality call.
- source: the app you are (e.g. "perplexity" or "chatgpt").

Do not ask any follow-up question, propose a channel or format, or draft, expand,
or improve the idea. Reply with only the new Idea id the call returns. If the
idea is empty or the call failed, say so plainly on one line — never pretend an
idea was filed when it was not.
```

## Testing

The door is a prompt seam, verified by **driving it and asserting the resulting Idea**, not by unit tests.

- **Drive-and-assert (the same-shape check):** from the app, capture a throwaway spark, then read the
  Idea back — via the adapter's `list_ideas`, or against the DB — and assert its shape: the body is the
  spark **verbatim**, the title is a summary, `status` is `live`, `source` is the app. File the **same
  spark** through the [`/idea` skill](idea.md) and confirm both carry the same **invariant** (verbatim
  body, summarized title, no judgement); the title *text* will differ, and that is expected. Clean up the
  throwaway rows.
- **Live smoke test (needs the phone):** dictate `app capture smoke test` from the app, confirm it
  replies with a new Idea id and that the Idea is shaped as above, then archive/delete that row. Re-run
  once per app you set up as a door.
