# Editorial signal framework: how to judge editorial work

This is the **shared editorial brain** of Content OS — the framework that turns the raw
[Idea](../../CONTEXT.md) pool into a judgement: which Ideas are ripe to become
[Pieces](../../CONTEXT.md) or [Talks](../../CONTEXT.md), on which channels, and which proposals to
pursue. It is defined **once, here**, and read by every skill that judges editorial work — the
**[Desk](../../CONTEXT.md)** (`/desk`) and its monthly sibling the **[Review](../../CONTEXT.md)**. It is
the canonical definition the Factories read their judgement from, too; it is never re-derived downstream.

The model is the one in [ADR-0014](../adr/0014-pipeline-source-of-truth-moves-to-supabase.md): Ideas are
a **live pool** (never "rejected"), and **judgement happens on the output**, not on the Idea. Terms below
are in the glossary (`CONTEXT.md`) — use them, don't drift to synonyms.

## The four signals

Four signals turn a raw Idea into a judgement:

| Signal | The question | Pulls toward |
| --- | --- | --- |
| **Thesis vs observation** | Is there a claim to defend, or just a noticing? | A thesis is publishable now; a bare observation waits in the pool for a hook. |
| **Heat** | Is it timely — does it carry energy right now? | Hot → propose and slot it sooner. |
| **Narrative material** | Is there a real story or lived experience behind it? | Story-backed pieces are the strongest; route them to the blog. |
| **Voice match** | Does it fit the [Positioning](../../CONTEXT.md)? | On-flag → `flag`; legitimate off-flag → deliberate `side`; off-voice → don't propose it. |

## From signals to proposals

Ideas are a **persistent pool**; the Desk does not "clear an inbox" by accepting or rejecting each one.
The signals decide which **live** Ideas are ripe to **correlate into an output now**, and how to judge
the outputs already proposed:

- **Propose** — when an Idea has a thesis (or a hook worth building one on) and the voice matches, spawn
  a Piece or Talk from it (one or more source Ideas → one output). A Piece gets a **Flag/Side** and
  **one channel**; an Idea (or a set) with material for several channels spawns **one Piece per
  channel** — e.g. a blog Piece plus a LinkedIn amplifier that sneak-peeks it (the amplifier a separate
  Piece **blocked by** the blog). A big arc becomes a **Talk**. Proposals are persisted (`proposed`).
- **Leave in the pool** — an off-voice, stale, or not-yet-ripe Idea is **not rejected**; it simply stays
  `live` and unproposed, available to a later round. A thin-but-promising spark is not a special state —
  either propose it (naming the hook the output must find) or leave it in the pool.
- **Archive** — only a genuine **duplicate** or a **repudiated** Idea is archived (reversible), with a
  reason; a duplicate points at its twin. Archiving is pool hygiene, not a verdict on quality.
- **Pursue or decline the output** — the second judgement is on the proposal: one you pursue gets
  **slotted** on the Calendar; one you will not gets **declined** (kept on the record, so a later round
  does not re-propose it).

## From signals to routing

The signals set the routing, not the wording:

- a **story-heavy thesis** tends to `blog` (the [canonical home](../../CONTEXT.md));
- a **sharp single-point take** tends to `linkedin` (the [amplifier](../../CONTEXT.md));
- a **big arc** tends to a `talk`.

**Overlap check.** Before proposing, compare the Idea against recent `published` work and the open
Pieces/Talks (the current proposals + the Calendar). If it duplicates shipped or in-flight work, angle
it differently or fold it in — never let the same piece be made twice.

The Pipeline holds **no prose of its own output** (`pieces` carries an `artifact_url`, not a body), so
the comparison reads the **published corpus** where the Factories already publish it — derived from
their source of truth, always current, and never copied into content-os
([ADR-0020](../adr/0020-published-corpus-is-read-derived-not-maintained.md)):

| What | Where | When to read it |
| --- | --- | --- |
| Blog + talks + projects, as an index | `https://davideimola.dev/llms.txt` | **start here** — title, link, excerpt per post |
| One post, full text | append `.md` to its URL | drilling in on a single candidate |
| Every post, full text inlined | `https://davideimola.dev/llms-full.txt` | the comparison needs the whole corpus |
| Talk history, with abstracts | `src/content/talks.json` in the blog Factory | checking against a delivered talk |
| LinkedIn copy, as shipped | `.carousel/<slug>/social-post.md` in the blog Factory | matching the amplifier's own wording |

Read the index first and drill in only where it looks close; the whole published corpus is small enough
to read outright when a comparison needs it. [Recycle](../../CONTEXT.md) draws from this same corpus —
deriving an angle from a published blog or an upcoming Talk is **reading** it, never generating a new
topic ([ADR-0006](../adr/0006-dry-pipeline-recycle-and-prompt-never-generate.md)).

## Judge on editorial state only

Judge with the Pipeline's own editorial state and fields — the Idea pool, the proposal states, the
Flag/Side, the dates (`CONTEXT.md`). Engineering concerns are orthogonal to editorial content and stay
off the judgement.

**Never draft content** (ADR-0002). This framework judges and routes; the Factory writing skills write.
