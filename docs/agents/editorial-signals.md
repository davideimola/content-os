# Editorial signal framework: how to judge an Idea

This is the **shared editorial brain** of Content OS — the framework that turns a raw
[Idea](../../CONTEXT.md) into a judgement: is it worth accepting, and if so, what
[Pieces](../../CONTEXT.md) does it become and on which channels. It is defined **once, here**, and
read by every skill that judges editorial work — today the **[Desk](../../CONTEXT.md)** (`/desk`), and
its monthly sibling the **[Review](../../CONTEXT.md)** once it lands. It is the canonical definition
ADR-0012's invariant points the Factories at, too: a Factory's editorial-lifecycle skill reads its
judgement from here, it is never re-derived downstream.

Terms below are defined in the glossary (`CONTEXT.md`) — use them, don't drift to synonyms.

## The four signals

Four signals turn a raw Idea into a judgement:

| Signal | The question | Pulls toward |
| --- | --- | --- |
| **Thesis vs observation** | Is there a claim to defend, or just a noticing? | A thesis is publishable now; a bare observation needs a hook first. |
| **Heat** | Is it timely — does it carry energy right now? | Hot → slot it sooner. |
| **Narrative material** | Is there a real story or lived experience behind it? | Story-backed pieces are the strongest; route them to the blog. |
| **Voice match** | Does it fit the [Positioning](../../CONTEXT.md)? | On-flag → `flag`; legitimate off-flag → deliberate `side`; off-voice → reject. |

## From signals to a verdict

An Idea is judged into exactly one of two outcomes (there is no in-between "proposed idea" any more —
the state ladder split, [pipeline-taxonomy.md](pipeline-taxonomy.md)):

- **Accept** — there is a thesis (or a hook worth building one on) and the voice matches. The Idea
  **spawns one or more Pieces** and stays open as their umbrella. Each Piece gets a **Flag/Side** and
  **one channel**; a single Idea with material for several channels spawns **one Piece per channel**
  (e.g. a blog Piece plus a LinkedIn amplifier that sneak-peeks it — the amplifier a separate Piece
  **blocked by** the blog Piece).
- **Reject** — off-voice, stale, or a duplicate of shipped/in-flight work. **Close** the Idea with a
  one-line why on the record, so the reason stays out of the plan but on the record.

A **thin-but-promising** spark is not a third state: either accept it (naming the hook the Piece must
find) or leave it unjudged in the inbox for a future session — never a half-judged limbo.

## From signals to routing

The signals set the routing, not the wording:

- a **story-heavy thesis** tends to `blog` (the [canonical home](../../CONTEXT.md));
- a **sharp single-point take** tends to `linkedin` (the [amplifier](../../CONTEXT.md));
- a **big arc** tends to a `talk`.

**Overlap check.** Before accepting, compare the Idea against recent `published` and the open Pieces.
If it duplicates shipped or in-flight work, either angle it differently or fold it in — never let the
same piece be written twice.

## Judge on editorial labels only

Judge with the Pipeline's own labels and comments (see the [taxonomy](pipeline-taxonomy.md)). The
engineering triage labels (`needs-info`, `wontfix`, …) are orthogonal to editorial content and stay
off Ideas and Pieces ([triage vs Pipeline](pipeline-taxonomy.md#triage-vs-pipeline-labels)).

**Never draft content** (ADR-0002). This framework judges and routes; the Factory writing skills write.
