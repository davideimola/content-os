# Pipeline taxonomy: three tiers

The [Pipeline](../../CONTEXT.md) is the single home for every idea, proposal, and in-flight piece
across all channels, tracked as GitHub issues on `davideimola/content-os`. It is a **three-tier model
of linked issues** — **Idea → Pieces → CFPs** (ADR-0011) — so one spark can become several outputs,
each with its own life. The tiers are made real on the tracker as **labels** plus the tracker's
**native sub-issue and dependency graph**, so every skill and Beat classifies the same way.

Terms below are defined in the glossary (`CONTEXT.md`) — use them, don't drift to synonyms.

## The three tiers

| Tier | What it is | How to identify it (observable, no state file) |
| --- | --- | --- |
| **1 — Idea** | A raw, unjudged spark (ADR-0008 capture doors). Judged **accepted** or **rejected**. An accepted Idea stays open as the **umbrella** over the Pieces it spawned. | `idea` label. **Unjudged** = open + **0** child Pieces. **Accepted** = open + **≥1** child Piece. **Rejected** = closed. |
| **2 — Piece** | One channel output (blog / linkedin / talk) with its own lifecycle, date, and production artifact. | A **channel** label + a **state** label from `{proposed, slotted, in-production, published}`, **not** `idea`, linked as a **sub-issue** of its Idea. |
| **3 — CFP** | One submission of a Talk Piece to one conference, with its own deadline and outcome. **One Talk Piece → many CFPs.** | `cfp` + `talk`. |

The tier of any issue is readable from its **labels + the sub-issue graph** — there is no maintained
state file to keep in sync (ADR-0013's "no new artifact" rule). "Accepted but no Pieces yet" is not a
representable state: accepting an Idea **spawns its Piece(s) atomically**, so an open `idea` with zero
children is always still unjudged.

## State: two axes, split across the tiers

The old single ladder (`idea → proposed → slotted → in-production → published`) **splits cleanly**:
`idea` is the **Tier-1 judgment axis** (an Idea's whole state), and the rest is the **Piece
lifecycle**. No new states were invented.

**Tier 1 — the Idea's judgment** (an Idea never carries a Piece-lifecycle state, never gets a Calendar
date):

| State | Meaning |
| --- | --- |
| `idea`, open, 0 children | Unjudged spark. Capture first, judge later. |
| `idea`, open, ≥1 child | Accepted — the umbrella over its Pieces. |
| closed | Rejected — closed with a one-line why on the record. |

**Tier 2 — the Piece lifecycle** (mutually exclusive; a Piece carries **exactly one** at a time):

| Label | Meaning |
| --- | --- |
| `proposed` | Spawned from an accepted Idea: thesis, channel, Flag/Side decided. |
| `slotted` | Placed on the Calendar (Projects board) with a target date. |
| `in-production` | Being produced in a Factory — a draft, PR, or slides in progress. |
| `published` | Shipped on its channel. Terminal state. |

Flow: `proposed` → `slotted` → `in-production` → `published`. Mutual exclusivity is a convention the
skills enforce — GitHub does not; a move removes the old state and adds the new one.

## Dimension labels — carried by Pieces

Dimensions describe a Piece and steer the mix. Every Piece carries **exactly one Flag/Side** and
**exactly one channel** the moment it is spawned (`proposed`). An Idea carries neither — it is a pure
umbrella.

**Flag vs Side** — mutually exclusive by convention:

| Label | Meaning |
| --- | --- |
| `flag` | Flag content: directly reinforces the Positioning. Steering target ~70% of output. |
| `side` | Side content: legitimate off-flag content for variety and authenticity. |

**Channel** — where the Piece publishes. Each Piece has exactly one; an Idea that yields more than one
channel spawns **one Piece per channel** (sibling sub-issues), never one multi-channel issue.

| Label | Meaning |
| --- | --- |
| `blog` | The blog on davideimola.dev — the canonical home. |
| `linkedin` | LinkedIn — the amplifier; value delivered natively in-feed. |
| `talk` | A conference talk treated as editorial work. |

**CFP tracking**:

| Label | Meaning |
| --- | --- |
| `cfp` | A CFP opportunity tracked with its deadline and outcome. Pairs with `talk`. |

## Linking conventions — the tracker's native graph

The tiers are wired with GitHub's **native** relationships, so navigation is UI-visible, not a
convention buried in an issue body. Both are enabled on `davideimola/content-os` (confirmed at the
tracker seam). The same `gh api` patterns are documented for the wayfinder in
[`issue-tracker.md`](issue-tracker.md).

**Idea → Piece (sub-issue / parent-child).** Each Piece is a **sub-issue** of its Idea. Link a child
with the sub-issues endpoint, passing the child's numeric **database id** (not its `#number`):

```sh
child_id=$(gh api repos/davideimola/content-os/issues/<piece> --jq .id)
gh api --method POST repos/davideimola/content-os/issues/<idea>/sub_issues -F sub_issue_id=$child_id
# list an Idea's Pieces:
gh api repos/davideimola/content-os/issues/<idea>/sub_issues --jq '[.[] | {number, title}]'
```

**Piece → Piece (dependency / `blocked_by`).** A Piece can **block** a sibling — the canonical case is
a blog Piece blocking the LinkedIn amplifier that sneak-peeks it, so the amplifier can't be worked
before its blog. Add an edge with the dependencies endpoint, passing the blocker's numeric **database
id**:

```sh
blocker_id=$(gh api repos/davideimola/content-os/issues/<blog-piece> --jq .id)
gh api --method POST repos/davideimola/content-os/issues/<amplifier>/dependencies/blocked_by \
  -F issue_id=$blocker_id
# GitHub reports open blockers as the live gate:
gh api repos/davideimola/content-os/issues/<amplifier> --jq '.issue_dependencies_summary.blocked_by'
```

A body-convention fallback (`Part of #<idea>` / `Blocked by: #<n>`) exists but is **not** used here —
both native features are available.

## CFP outcome — a separate axis

A `cfp` issue carries an **outcome** — where the opportunity stands — captured as the **Outcome**
field in the issue body (the CFP template's dropdown, `.github/ISSUE_TEMPLATE/cfp.yml`), **not** as a
label. It is a **separate axis** from the Piece lifecycle: the state says where the *Piece* is, the
outcome says whether the *submission* is in. Advance it by editing the issue body.

| Outcome | Meaning |
| --- | --- |
| `to submit` | Identified; proposal not yet sent. The default at capture. |
| `submitted` | Proposal sent; awaiting the committee. |
| `accepted` | In — the talk is happening. |
| `rejected` | Declined. Terminal for this opportunity. |

How the two axes interact: a `to submit`/`submitted` CFP sits on the Calendar by its **deadline**.
Once **`accepted`**, the **Talk Piece** it submits rides the normal Piece lifecycle — `slotted` when
dated on the Calendar (by the **conference date**), `in-production` while the slides are built in the
[`presentations` Factory](../../CONTEXT.md), `published` once delivered.

**One Talk Piece, many CFPs.** A talk pitched to several conferences is **one Talk Piece** (here) and
**one CFP issue per conference** (here too), each linking back to that same Talk Piece
(`content-os#<n>`) and carrying its own deadline, outcome, and Calendar date. Each acceptance rides the
Talk Piece's ladder on that conference's date — the same talk legitimately delivered more than once,
not duplicate content. The talk brief the Piece reuses lives as an artifact in the `presentations`
Factory, linked from the CFP body alongside the Talk Piece.

## Cadence is counted over Pieces

The [Cadence](../../CONTEXT.md) floor — **1 blog Piece/month, 1 LinkedIn Piece/week** — is measured
over **Pieces, never Ideas**. The floor counts shipped (or credibly scheduled) *outputs*, not sparks;
an Idea that never spawns a Piece contributes nothing to Cadence. Flag mix (~70%) is likewise a ratio
over Pieces' Flag/Side labels.

## Who moves what — the Desk advances state, the Beats only remind

State changes happen in an **interactive session with Davide in the loop**, not autonomously:

- The **[Desk](../../CONTEXT.md)** (and its monthly sibling the **[Review](../../CONTEXT.md)**) is where
  judgment lands: it judges Ideas accept/reject, spawns Pieces (Flag/Side + channel + `proposed`),
  blocks sibling Pieces, and slots/reslots/de-slots Pieces on the Calendar — **the Desk advances
  state**, all in one approved batch.
- The **[Beats](../../CONTEXT.md)** are **deterministic staleness reminders** (ADR-0013): they detect
  staleness from observable facts and ping Davide to open the Desk or the Review. **The Beats only
  remind — they never judge or change the Pipeline.**

## Single source of truth (ADR-0012)

The content-os Pipeline issue is the **single source of truth every editorial-lifecycle skill reads
context from and writes outcomes to** — here and in the Factories (`davideimola.dev`, `presentations`).
A **Factory holds only artifacts** (a draft, `TALK.md`, slides) that reference the owning
`content-os#<n>` issue; it never holds the editorial state. Every Piece points at its Factory artifact,
and every artifact points back at its Piece.

## How issues acquire labels

- **Idea template** (`.github/ISSUE_TEMPLATE/idea.yml`) applies `idea` on creation. Nothing else — no
  format, channel, or quality decision at capture time.
- **CFP template** (`.github/ISSUE_TEMPLATE/cfp.yml`) applies `cfp` and `talk` on creation, and links
  the Talk Piece it submits (`content-os#<n>`) plus the brief in `presentations`.
- **Capture doors** file Ideas directly with the `idea` label and nothing else. The machine-side door
  is the `/idea` Claude skill (see [idea.md](idea.md)); the AI-app door files the same shape from any
  app with a write-capable GitHub connector (see [app-capture.md](app-capture.md)). Blank issues stay
  enabled so capture is never forced through a form.
- **The Desk** sets everything downstream: on accept it spawns Pieces with a Flag/Side and channel at
  `proposed`; slotting adds `slotted`; a Factory picking a Piece up moves it to `in-production`; the
  creator publishing moves it to `published`. **Pieces have no issue template** — only Ideas and CFPs
  are human-filed through forms; Pieces are spawned programmatically by the Desk.

## Triage vs Pipeline labels

The triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` — see
[`triage-labels.md`](triage-labels.md)) govern engineering issues on this repo. They are orthogonal to
the Pipeline tiers above, which govern editorial content. An editorial issue lives in the Pipeline
tiers; a build-the-system issue lives in triage.
