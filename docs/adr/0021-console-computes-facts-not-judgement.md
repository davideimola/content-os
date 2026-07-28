---
status: accepted
amends: [ADR-0016]
relates: [ADR-0002, ADR-0007, ADR-0013, ADR-0015, ADR-0019]
---

# The console computes facts about time and completeness, never judgement

[ADR-0016](0016-management-web-ui-writes-through-the-rpc-contract.md) built `content-os-web` as **hands,
not brain** and drew the brain/hands line by enumeration — decision 2: *"The console never embeds the ~70%
Flag mix, the Cadence judgement, or the amplifier rule."* An enumeration answers three cases and governs
none. The console rework is a stack of additions that each *look* like one of those three from a distance
and are not: a bar showing the realized Flag/Side split **against its ~70% target**, a readiness mark that
reads *late* on a dated but unwritten Piece, the weeks ahead with no `linkedin` Piece, coverage per Theme.
Without a rule that separates them, every addition re-litigates the charter and the answer depends on who
is arguing.

The failure mode is not one bad addition; it is a sequence of reasonable ones. Measured on the session
date (Tue 28 July 2026), the home showed **two green Cadence pills** while Friday's LinkedIn Piece was
`slotted` and unwritten, three days out — 11 of the 14 dated Pieces were `slotted` and exactly **1** was
`ready`. The repair is arithmetic: days-until against a lead-time constant, and the Piece reads *late*.
The tempting next step, one addition later, is for the console to say what to *do* about it — a ranked
"what to write next", a "your mix is off, write more Security". At that point the console is a second
editorial brain holding none of the Desk's equipment ([`editorial-signals.md`](../agents/editorial-signals.md),
the Overlap check over the published corpus per [ADR-0020](0020-published-corpus-is-read-derived-not-maintained.md),
and a human in the loop), and content-os has two places that judge and can disagree.

So the boundary is written down where it can be cited, with the two criteria the rework applied by hand:
what earns a view, and what a breakpoint is allowed to change.

## Decisions

1. **The rule: the console computes facts; it never weighs the value of content.** Two clauses, because
   they are different permissions. What it may **derive** is facts about **time and completeness** —
   arithmetic over dates, states, the presence or absence of a field, and counts against a target stated
   elsewhere: a date approaching, a dated Piece with nothing written, a floor with no slot, a `published`
   Piece with no artifact URL, a submission with no deadline, an Idea with no Theme. What it may **report**
   is numbers **of record, unranked** — the month's impressions, a Piece's engagements, coverage per Theme.
   Reporting a measurement is not weighing content; concluding from it is. The console shows 450
   impressions; it never says which output did well, or what to write next.
   This **sharpens ADR-0016 decision 2** rather than reversing it: "never embeds the ~70% Flag mix" means
   never holding the *judgement* — the console may render a target it **does not own** and show the
   distance to it, because that is subtraction; it may not set, tune, or argue about one. **There is no
   suggestions block anywhere** — no recommendation text, no priority score, no ranking of Ideas or
   proposals. The working form of the rule is the corollary: **the console shows facts that imply an
   action; the [Desk](0007-desk-interactive-planning-surface.md) says what to do.**

2. **The keep-a-view criterion.** A view earns its place if you **correct something** there, **notice a
   delay** there, **or understand how things are going** there. One of the three is enough; none of the
   three and the view does not exist. It is the per-**view** test, where decision 1 is the per-**element**
   test. It is what dissolved the Pipeline board: of 18 Pieces, 14 are dated (`slotted`/`ready`/
   `published`), 3 are `proposed` and 1 is `declined`, so removing the `proposed` column leaves three
   columns holding exactly the 14 items the Calendar already shows — the same set re-sorted by state. It
   corrected nothing the Calendar could not and noticed no delay the Calendar could not. The criterion's
   third clause is also what earns the metrics on the Overview (decision 4).

3. **The responsive rule: same view, same question, different density.** Never a different information
   architecture per breakpoint. **Mobile-first** (ADR-0016) means the phone is the *first* density, not the
   only one: a wide screen may legitimately be denser — a lane beside the agenda instead of a stacked band,
   cards in columns instead of one narrow ribbon — but it must not answer a different question, and it must
   not carry an element the phone lacks. Two consequences: there is no desktop-only view and no
   phone-only view; and where an element's legibility is in doubt, **the phone is the deciding test**. The
   theme concept map stayed in the console because it read at a true 390px viewport — had it needed a wide
   screen, the honest answer was that it belonged to `/review`, not here.

4. **Decision 12 of the originating session is replaced, not applied.** The `/grill-with-docs` session of
   2026-07-28 that originated this rework locked 13 decisions; the twelfth read: *"The home keeps a minimal
   LinkedIn metrics row. Explicitly logged as an exception motivated by habit, not by the criterion — a home
   that only says what you failed to do is a home you stop opening (ADR-0016's 'tool I don't use' risk).
   Must be documented as an exception so it is not cited as precedent."* The reworked Overview does the
   opposite of *minimal*: it **leads** with the month's LinkedIn numbers and a row of charts
   ([ADR-0019](0019-linkedin-metrics-contract-follows-the-aggregate-export.md) put the numbers there to
   read). This ADR records that as a **replacement**, because a record that keeps an exception bigger than
   the thing it excepts reads as incoherent.
   The invariant is nonetheless preserved. The charts are arithmetic — output per month shipped vs planned,
   the mix against its target, written-vs-dated, and both Cadence floors — and the tiles are numbers of
   record, reported and never ranked (decision 1, second clause). What was wrong in decision 12 was not the
   row but its **justification**: it declared itself an exception because it read the rule as *time and
   completeness only* and had nowhere to put a measurement. A measurement belongs under *report*, and the
   session's own criterion already contained the clause that earns it a place — *you understand how things
   are going there* — applied to a block as much as to a view. So the exception retires together with its
   caveat: there is no longer an exception to cite as precedent, because the metrics stand on the rule.
   What survives from decision 12 is its **reason** — a home that only says what you failed to do is a home
   you stop opening — promoted from a guilty aside to the stated motive.

5. **Where a Beat and the console overlap, the Beat's definition wins.** Cadence *covered* means **a slot
   exists**; the Thursday Beat ([ADR-0013](0013-beats-are-staleness-reminders.md)) reads the same
   `cadence_status` view, so the console keeps the pills' meaning and **never redefines the predicate**.
   Where it wants more, it adds a **fact beside it** — readiness, and the weeks and months ahead with no
   slot, which project the Beat's own definition of *covered* forward over a longer window. Two surfaces
   over one view must say one thing, or the human trusts neither.

## Considered Options

- **Leave ADR-0016 decision 2's enumeration as the boundary.** Rejected: it names three forbidden things
  and no rule. Read literally it forbids the mix bar, which is subtraction against a number set editorially
  elsewhere; read loosely it forbids nothing. The rework needed a test it could apply twenty times and get
  the same answer.
- **Give the console a "what to write next" block** — the addition that will be proposed again, because the
  data is right there. Rejected: it duplicates the Desk with worse equipment (no editorial signals, no
  Overlap check against the published corpus, no conversation), and a suggestion overridden twice becomes
  noise, then furniture. Judgement is earned by being in the loop, which is what `/desk` is.
- **Ban measurements from the console** — the strict reading of "time and completeness", and what decision
  12 half-did by keeping a *minimal* row as a guilty exception. Rejected: it removes the one thing that
  makes the home worth opening at a glance, and it confuses measuring with judging.
  [ADR-0002](0002-no-app-repo-plus-claude-routines.md)'s real worry is "one more place not to go"; a home
  that lists only debts guarantees it.
- **Keep decision 12 as a documented exception** (what the session asked for). Rejected — decision 4: the
  Overview now leads with metrics, so the "exception" is most of the view, and an exception larger than the
  rule is a rule.
- **Let the phone have its own information architecture.** Rejected: two layouts is two products to learn
  for one user, and in practice the element in doubt gets dropped from the phone — which is the breakpoint
  the primary occasion, the glance at a ping, actually happens on.
- **Write the rule in [`web-console.md`](../agents/web-console.md) instead of an ADR.** Rejected: that doc
  tracks what the console **is** and is rewritten every slice; this constrains what the console may
  **become**, has to survive those rewrites, and has to be citable when an addition is reviewed. It is a
  decision, so it is a decision record.

## Consequences

- **Amends ADR-0016 with the navigation consequence**: the console goes from **six views to five** —
  Overview, Calendar, Ideas, Talks, Metrics — and the **Pipeline view dissolves**, removed and not
  replaced (decision 2, with the numbers). Recorded as an amendment note at the top of ADR-0016, the way
  ADR-0016's own amendment is recorded in ADR-0002. ADR-0016 decision 2 is **sharpened, not reversed**
  (decision 1); decisions 1 and 3 of ADR-0016 — RPC-only writes, no logic of its own — are untouched, and
  they are why this rule is about *what the console shows*, never about how it writes.
- **Replaces decision 12** of the 2026-07-28 session. That session's own record was a scratch handoff file,
  never committed; its decision 12 survives verbatim — and already flagged as replaced — in
  `PROTOTYPE-VERDICT.md` on the throwaway branch `prototype/dashboard-rework-2026-07-28` (commit
  `15cb154`), which is the citable copy.
- **The rule is already load-bearing across the rework**: readiness as a *derived* fact rather than a
  state; cadence holes projecting `covered` forward; the mix bar against ~70%; coverage per Theme counted
  **over Pieces** (the same metre as Cadence and the Flag mix); "no post linked / month not ingested"
  instead of an empty cell; `published` Pieces with no `artifact_url`; submissions with no deadline. Every
  one is arithmetic or a presence check, and none of them ranks content.
- **It has a real cost, accepted**: the console will not rank the proposals, score an Idea, or tell Davide
  which Theme is under-shipped, even where the data would allow it. Those stay in `/desk` and `/review`
  ([ADR-0015](0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md) dec.5). If the console
  ever needs one, that is an ADR superseding this one — not a slice.
- **Documentation only**: no schema, no verb, no component changes here; the rework's slices realize it.
  The living docs (`CLAUDE.md`, `docs/agents/web-console.md`) follow the code as those slices land,
  including the correction that "mobile-first" is the **responsive** sense of decision 3 and not
  mobile-only. **CONTEXT.md is unchanged by this decision** — architecture, not domain language.
- **Revisit if the Desk stops being where planning happens.** The rule is honest only while the judgement
  it excludes has a better home. If `/desk` fell out of use, this decision would have to be reopened
  deliberately, rather than eroded one reasonable addition at a time.
- **Nothing to verify at a seam** — no behaviour changes: `pnpm lint` clean, no source file touched.
