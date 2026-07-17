# Editorial skills read/write the content-os Pipeline as shared knowledge; editorial-route collapses; production skills own one channel

Skills that touch content live in three repos — content-os (`idea`, `desk`), the blog Factory
`davideimola.dev` (`editorial-route`, `write-blog-post`, `social-post`), and the talks Factory
`presentations` (`talk-forge`, `cfp-submit`, `slide-craft`). The blog Factory already treats the
content-os Pipeline as shared knowledge; the talks Factory was an island (zero content-os references,
no CLAUDE.md), opening `talk`-labeled editorial issues on its own repo against ADR-0001. Building on
ADR-0011's tiers, we set one invariant for all repos and resolved its consequences for the skills.

**The invariant:** the content-os Pipeline issue is the **single source of truth every
editorial-lifecycle skill reads context from and writes outcomes to**; a Factory holds only
**artifacts** that reference the owning `content-os#<n>` issue. Recorded here (extends ADR-0001); each
Factory's CLAUDE.md points to it. Pure-artifact skills are **exempt** — the test: *does the skill make
or act on an editorial decision* (bound) *or only shape an artifact from an already-decided brief*
(exempt)? `slide-craft` is exempt (it scaffolds Slidev from `TALK.md`); it inherits the content-os link
transitively through `TALK.md`.

## Decisions

1. **The invariant + exemption test above** are canonical, in content-os.
2. **`editorial-route` collapses.** Its three parts each dissolve: its *judgment* is the shared
   editorial signal framework (already canonical in content-os, read by `desk` and the Monday Beat — so
   no extraction is needed, and its own drifted copy dies with it); its *dispatch* to a production
   skill is a trivial direct call on the Piece; its *cross-Factory routing* adds nothing once the
   channel is known. Channel is decided by `desk` (interactive) or the Monday Beat (autonomous);
   production is a direct skill call on the Piece.
3. **Production skills own one channel.** `write-blog-post` produces the blog Piece and references its
   content-os issue; it **no longer creates or proposes a social Piece**. Whether a blog earns a social
   amplifier is a **`desk` decision** — a separate social Piece, blocked by the blog Piece (ADR-0011).
   `social-post` produces a **sneak-peek amplifier, deliberately not a duplicate** of the blog: a social
   post that repeats the blog's full content depresses the blog's own reach.
4. **Talks are wired like the blog.** The Talk editorial item is a **content-os Piece**; `talk-forge`
   creates/uses that Piece and keeps `TALK.md` + the Slidev scaffold as the `presentations` artifact
   referencing `content-os#<n>` — it **stops opening `talk`-labeled issues on `presentations`**.
   `cfp-submit` reads the content-os **CFP** items (one per conference) + the `TALK.md` brief and writes
   each CFP's outcome back. **`presentations` gains a CLAUDE.md** stating the content-os relationship
   (mirroring `davideimola.dev`). The stale `contentos idea create` reference in `davideimola.dev` is
   fixed (→ the `/idea` skill or `gh`, per ADR-0008/0009).

## Considered Options

- **Promote `editorial-route` to a cross-Factory router** (a content-os personal skill): rejected —
  once the channel is known the dispatch is a trivial direct skill call on the Piece, and the judgment
  is shared knowledge `desk`/the Beat already apply; the router earned nothing.
- **Leave the talks Factory an island**: rejected — it violates the invariant and ADR-0001 (talks and
  CFPs are centralized on content-os).

## Consequences

- **Execution spans three repos** (a sizable build, not done here): delete `editorial-route` + update
  `davideimola.dev/CLAUDE.md` + strip social-creation from `write-blog-post`; wire
  `talk-forge`/`cfp-submit` + add `presentations/CLAUDE.md`; content-os's `idea`/`desk` already comply.
  Each skill's prose is refined with `writing-great-skills`.
- **Parked, its own ADR:** the Beats may shrink to **staleness-based reminder pings** ("time to run
  `desk` / import metrics"), tracking recency of the last desk / post / import rather than planning
  autonomously — considered, not decided here.
