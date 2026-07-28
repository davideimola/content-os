---
status: accepted
relates: [ADR-0002, ADR-0006, ADR-0012, ADR-0014]
---

# The published corpus is read derived, never maintained as a wiki

content-os has a documented gap it could not actually execute. `editorial-signals.md` instructs the
Desk: *"Before proposing, compare the Idea against recent `published` work and the open Pieces/Talks
— never let the same piece be made twice"* (the **Overlap check**), and [Recycle](../../CONTEXT.md)
promises *"an angle derived from a published blog or an upcoming Talk"* ([ADR-0006](0006-dry-pipeline-recycle-and-prompt-never-generate.md)).
But the Pipeline holds **no prose of its own output**: `pieces` has `title`, `channel`, `flag_side`,
`state`, `publish_date`, `artifact_url` — no body. Both instructions ran blind on content.

The proposed fix, brought in from outside, was Karpathy's **[LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)**
pattern: an LLM incrementally builds and maintains a persistent, interlinked markdown wiki over a
collection of raw sources (ingest → query → lint), so synthesis is *compiled once and kept current*
rather than re-derived on every question.

We decided **not** to maintain a wiki. The gap is real, but it closes by **reading a derived corpus
at runtime**: the Factories already publish everything content-os needs, in a machine-readable form
that regenerates itself from their source of truth. **A derived artifact beats a maintained one
whenever derivation is possible** — the wiki's whole value proposition is solving a *maintenance*
burden (*"humans abandon wikis because the maintenance burden grows faster than the value"*), and
here there is no maintenance to solve.

## Decisions

1. **The Overlap check and Recycle read the Factory's published corpus at runtime.** `davideimola.dev`
   already ships the two-file structure the pattern prescribes, built deterministically at request
   time from the MDX (`buildLlmsFullTxt(getAllPosts())`, cached): **`/llms.txt`** is the index (title,
   link, excerpt per post, plus talks and projects) and **`/llms-full.txt`** inlines the full text of
   every post; each post is also served as raw Markdown by appending `.md` to its URL. The Desk reads
   the index and drills in when a comparison needs the body. content-os **copies nothing**.

2. **No maintained wiki inside content-os.** A maintained wiki earns its keep only when all three
   hold: the corpus is **unbounded**, it is **not derivable** from a source of truth we own, and the
   value is in **synthesis across sources** rather than the sources themselves. No corpus content-os
   touches satisfies even two (see the table under *Consequences*): the published blog is derivable,
   the Idea pool is ours and small, the metrics are already structured. Where an index would suffice,
   an index is what we use.

3. **No prose enters the Pipeline; the blog does not move into the database.** `pieces` keeps no body.
   Holding published text in Supabase would buy something already available over HTTP, invert the
   [Factory](../../CONTEXT.md) boundary, and create an MDX↔row sync problem in which the blog's source
   of truth becomes ambiguous — the second-source-of-truth failure [ADR-0002](0002-no-app-repo-plus-claude-routines.md)
   and [ADR-0014](0014-pipeline-source-of-truth-moves-to-supabase.md) exist to prevent. The related
   but distinct wish — *authoring and editing posts from the phone* — is **production**, so it belongs
   to the blog Factory, not to the editorial HQ.

4. **The 32 historical talks are not backfilled into the Pipeline.** `davideimola.dev`'s
   `src/content/blog/../talks.json` already holds them structured (`date`, `event`, `location`, `tags`,
   and a `session` with title and **abstract**) and exposes them through `llms.txt`. Supabase models
   the **live editorial lifecycle** (`proposed → in-production → ready`, CFP deadlines and outcomes);
   a delivered 2023 talk has no lifecycle left. If an old talk is ever **re-delivered**, the model
   already covers it — *one Talk, many Engagements* — so the Talk is created then, when it becomes
   live editorial work again, while its past deliveries stay in the historical record.

5. **An input corpus, if one is ever built, lives outside content-os and is read by its index.** The
   one corpus that *does* pass all three conditions is what Davide **reads** — articles, papers,
   talks, books: unbounded, not ours, and valuable only as synthesis. content-os is an output system
   with no input system (the capture doors take *sparks*, not *sources*). Should such a corpus exist,
   content-os would **read its index** exactly as it reads `llms.txt` — never maintain it. It would
   **not** be a Factory (Factories produce content; this would produce knowledge), and it gets no
   glossary term until it exists.

## Considered Options

- **Maintain an LLM Wiki over the Pipeline / the published output** (rejected). Verified numbers, not
  taste: the entire published blog is ~19k words ≈ 25k tokens and fits one context window with a wide
  margin, so the pattern's own precondition (~100 sources, where an index stops being enough) is far
  away. It would add an ingest loop, a lint pass, an artifact that *can* drift, and — the decisive
  cost — **one more place not to go**, which is [ADR-0002](0002-no-app-repo-plus-claude-routines.md)'s
  core worry and the subject of Davide's own *"I Built a Tool I Don't Use"*.
- **Move the blog into the database with an editor** (rejected — decision 3).
- **Backfill the historical talks** (rejected — decision 4).
- **Leave the Overlap check as it is** (rejected): the instruction would stay written and unexecutable,
  which is worse than either building or deleting it — it reads as a covered concern that isn't.
- **Wait for the Idea pool to force the question** (rejected as unreachable): at the observed capture
  rate — 12 Ideas organically in 10 days, ~6/week, ~80 words each — the pool accumulates ~25k words a
  year, and by design it barely drains (an Idea stays `live` after spawning Pieces). Five years in it
  is still ~165k tokens. A pool-size trigger never fires, and if the pool ever did get heavy the cure
  would still be **derivation** (an index view), not a maintained wiki.

## Consequences

- **`editorial-signals.md` changes**: the Overlap check and Recycle now name where the corpus is read
  from, so both stop being blind. This is the only code/doc change the decision requires.
- **The corpus, as of 2026-07** — the baseline this decision rests on: 13 blog MDX (12 published in
  `llms.txt`) ≈ 19k words; 32 talks with abstracts in `talks.json`; 3 LinkedIn copies committed in the
  Factory at `.carousel/<slug>/social-post.md`; 14 live Ideas. Everything the system needs to compare
  against fits comfortably in a single context window.
- **Revisit when an unbounded, non-derivable corpus arrives** — not when the existing ones grow. That
  is the input corpus of decision 5, and it is tracked as a separate idea, deliberately unscoped.
- **A gap left open on purpose**: `TALK.md` briefs exist for 2 of 32 talks, so *what was argued on
  stage* is preserved only as an abstract. Enough for the Overlap check (it gives the topic), thin for
  Recycle. Reconstructing 30 briefs by hand is not worth it; new talks get a brief as they are built.
- **CONTEXT.md**: the [Factory](../../CONTEXT.md) entry is sharpened to say content-os *reads* the
  Factories' published output and never copies it. No new term is introduced — this is a boundary
  decision, and the input corpus stays unnamed until it exists.
- **Pre-existing debt surfaced, not fixed here**: [Recycle](../../CONTEXT.md) has no operational home.
  ADR-0006 defined it as a Beat mechanism, [ADR-0013](0013-beats-are-staleness-reminders.md) emptied the
  Beats, and neither `editorial-signals.md` nor `/desk` implements it — this ADR only wires it to the
  corpus it was always defined against. Tracked separately.
- Issue **#105 ("LLM Wiki Integration") is closed** by this ADR.
