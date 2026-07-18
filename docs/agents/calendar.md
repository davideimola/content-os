# Calendar: the by-date view over the Pipeline

The [Calendar](../../CONTEXT.md) is a **GitHub Projects (v2) board** over `davideimola/content-os`
issues: the by-date view of what publishes when, plus CFP and talk deadlines. It is not a second
backlog — the [Pipeline](../../CONTEXT.md) issues stay the **source of truth** (ADR-0001); the board
is a projection the [Desk](../../CONTEXT.md) keeps fresh so Davide can see the week at a glance (the
[Beats](../../CONTEXT.md) only **read** it to detect staleness — they never write it).

The board adds exactly **one thing the issues can't express: a date**. State already lives on the
issues as [state labels](pipeline-taxonomy.md); the board carries a `Stage` field that **mirrors the
Piece lifecycle 1:1** (`proposed` → `slotted` → `in-production` → `published`) only so a board layout
can show state-based columns. **Ideas are never board items** — an Idea carries no date and no
Piece-lifecycle state, so the board holds only Pieces and **pending** CFPs (the dated things — a CFP
sits by its deadline until accepted, when its Talk Piece takes the conference-date slot and the CFP
leaves the board). When a label and its mirror disagree, the **label wins** — the Desk's job is to keep them in step, the same way the two
capture doors are kept in step (see [app-capture.md](app-capture.md)).

Like everything else here it is **hands, not brain** (ADR-0003): the board holds no judgement and no
state of its own. Today the **Desk** maintains it by shelling out to the `gh` CLI directly (the recipes
below); folding these into a `contentos` Calendar subcommand is a later slice, not this one.

## What's on the board

Owner **`davideimola`** (a user project, not org), titled **`Content OS — Calendar`**, linked to the
`content-os` repo so it shows under the repo's Projects tab.

**Fields** — two beyond the built-ins:

| Field   | Type            | Meaning |
| ------- | --------------- | ------- |
| `Date`  | Date            | The target **publish date** (blog / linkedin) or the **deadline** (talk / cfp). The Calendar's spine. |
| `Stage` | Single-select   | Mirror of the Piece-lifecycle state label. Options are the exact label strings: `proposed`, `slotted`, `in-production`, `published`. No `idea` — Ideas are never board items. |

The built-in `Status` field (Todo / In Progress / Done) is **not** the state field — `Stage` is, so
its options can be set once from the CLI and match the labels verbatim, no translation. GitHub's
default "Item added to project" workflow auto-sets `Status` to `Todo` on every item, so left visible
it is redundant noise beside `Stage`; **hide it** in each view (⌄ menu → Fields → untick `Status`).
State on the board is `Stage` and nothing else — two state fields would be the drift trap this design
avoids. Channel and Flag/Side stay on the issue as labels (they drive filters, not columns) and are
read from the item's `Labels`.

The one thing `Status` is good for is automation, which only the built-in field has: enabling the
`Item closed → Done` + `Auto-archive items` (`is:closed`) workflows makes a **published-and-closed**
piece fall off the active board on its own, no Beat required. Optional — turn it on only if the habit
is to close an editorial issue once it ships.

**Views** (configured once in the web UI — see setup):

- **Pipeline** — Board layout grouped by `Stage`: one column per state, the tracker's flow made visual.
- **This week** — Table (or Roadmap) layout sorted by `Date`, filtered to the current week: the
  by-date view. A Beat reads the same window over the CLI (see recipes), so the UI view is Davide's
  convenience, not the Beat's dependency.
- **Talks & CFP** — Table filtered to `label:talk,cfp` sorted by `Date`: the speaker slice. Talks and
  CFP deadlines share this one board (user story 9); this view is just their filter, not a second board.

## One-time setup (requires Davide)

Creating a board touches Davide's GitHub account and needs an OAuth scope the default `gh` login
lacks. Run these once.

1. **Grant the `project` scope.** The `gh project` commands need it; the standard login does not have
   it. This is interactive (opens a browser):

   ```sh
   gh auth refresh -s project
   ```

   Confirm with `gh auth status` — the scope list should now include `project`.

2. **Create the board and link it to the repo.**

   ```sh
   gh project create --owner davideimola --title "Content OS — Calendar" --format json
   # note the "number" and "id" (PVT_…) it prints — you need both below
   gh project link <number> --owner davideimola --repo content-os
   ```

3. **Create the two fields.** (The `Date` field, and the `Stage` mirror with the four Piece-lifecycle
   options — no `idea`.)

   ```sh
   gh project field-create <number> --owner davideimola --name "Date" --data-type DATE

   gh project field-create <number> --owner davideimola --name "Stage" \
     --data-type SINGLE_SELECT \
     --single-select-options "proposed,slotted,in-production,published"
   ```

4. **Configure the views in the web UI** (grouping and filters are not settable over the CLI).
   Two different controls: **layout / group / sort** live in the view's **⌄ menu** (the chevron next
   to the view name); the **filter** is typed in the **filter bar at the top** ("Filter by keyword or
   by field"). After a change the view tab shows a dot — **⌄ menu → Save changes** to persist it.
   - **Pipeline** — rename the default view; ⌄ menu → layout **Board**, group by **Stage**. No filter.
   - **This week** — new view, layout **Table**; ⌄ menu → sort by **Date** ascending; filter bar:
     `date:@today..@today+1w` (today through the next week — a standing window that never goes stale).
   - **Talks & CFP** — new view, layout **Table**; ⌄ menu → sort by **Date**; filter bar:
     `label:talk,cfp` (the speaker slice — all public output stays on this one board, user story 9;
     this is just its filter). All filter strings above are valid Projects filter syntax (the same
     the CLI `--query` uses).

5. **Record the IDs the recipes need.** The recipes below take the project id and field/option ids.
   For this board they are fixed under [Current board coordinates](#current-board-coordinates); the
   Desk can also re-fetch them at run time (they are stable):

   ```sh
   gh project view <number> --owner davideimola --format json --jq '.id'          # project id  PVT_…
   gh project field-list <number> --owner davideimola --format json
   # → Date field id (PVTF_…), Stage field id (PVTSSF_…), and each Stage option's id
   ```

## Current board coordinates

The live board, created once against `davideimola`. The IDs are stable; the Desk may hardcode them or
re-fetch with the recipe above.

| What | Value |
| ---- | ----- |
| Project number | `2` |
| Project URL | https://github.com/users/davideimola/projects/2 |
| Project id (`--project-id`) | `PVT_kwHOAN8k8s4Bdpom` |
| `Date` field id | `PVTF_lAHOAN8k8s4BdpomzhYJsS8` |
| `Stage` field id | `PVTSSF_lAHOAN8k8s4BdpomzhYJsTA` |
| `Stage` options (`--single-select-option-id`) | `proposed`=`744a04fe` · `slotted`=`4cd2f423` · `in-production`=`5bcf9849` · `published`=`3afb71a2` (the `idea` option was retired — Ideas are never board items) |

## CLI recipes

Everything the **Desk** does to the Calendar, over `gh` (the Thursday Beat reuses only the **This
week** read below to detect staleness — it never writes). Placeholders: `<n>` project number,
`<pid>` project id (`PVT_…`), `<date-fid>`/`<stage-fid>` field ids, `<opt-id>` a Stage option id,
`<item-id>` a project item id (`PVTI_…`).

**Add** an issue to the board (idempotent — re-adding an existing item is a no-op that returns its id):

```sh
gh project item-add <n> --owner davideimola \
  --url https://github.com/davideimola/content-os/issues/<issue> --format json
# → the item's id (PVTI_…)
```

**Date** an item — set its target date (this is what puts it on the Calendar):

```sh
gh project item-edit --project-id <pid> --id <item-id> --field-id <date-fid> --date 2026-09-15
```

**Move** an item to a new state. State is a label first: move the label on the issue (the source of
truth), then mirror it into the board's `Stage`:

```sh
# 1. the canonical move — on the issue (see pipeline-taxonomy.md)
gh issue edit <issue> --repo davideimola/content-os --add-label slotted --remove-label proposed
# 2. mirror it onto the board so the Pipeline view's columns match
gh project item-edit --project-id <pid> --id <item-id> --field-id <stage-fid> \
  --single-select-option-id <opt-id-for-slotted>
```

**This week** — the by-date window a Beat reads (the CLI form of the "This week" view). Robust form,
filtering the JSON by the `Date` field with `jq`; pass the week's Monday/Sunday as `--arg`s
(a Beat computes them for the run):

```sh
gh project item-list 2 --owner davideimola --format json -L 500 \
  | jq --arg from 2026-07-13 --arg to 2026-07-19 '
      [ .items[]
        | select(.date != null and (.date[0:10]) >= $from and (.date[0:10]) <= $to)
        | {number: .content.number, title: .content.title, date: .date, stage: .stage, url: .content.url} ]'
```

Server-side filtering with `--query "date:2026-07-13..2026-07-19"` is a shortcut where the host
supports the Projects filter syntax; the `jq` form always works.

> Field values appear in `item-list --format json` under lower-cased field-name keys: `.date` (an ISO
> timestamp — slice `[0:10]` for the day) and `.stage`. The item's issue is under `.content`
> (`.content.number`, `.content.title`, `.content.url`). Confirm the exact keys from a first
> `--format json` dump if a query comes back empty.

**Remove** an item (rarely needed — prefer moving to `published`):

```sh
gh project item-archive <n> --owner davideimola --id <item-id>       # --undo to restore
```

## Verification (tracker seam)

No unit tests — the board is external GitHub state, verified by driving it and asserting the result
(the spec's tracker-seam rule). The acceptance check, run once after setup and re-runnable any time:

1. **The board exists** with the `Date` field and a state-grouped `Pipeline` view — `gh project
   field-list 2 --owner davideimola` shows `Date` and `Stage` (four options — no `idea`); the web UI
   shows the views.
2. **A slotted issue with a date shows up in the week view.** Create a throwaway issue, add it, set
   its `Date` inside the current week, set `Stage` to `slotted` (ids from
   [Current board coordinates](#current-board-coordinates)):

   ```sh
   # ids (<pid>, <date-fid>, <stage-fid>, slotted option) from Current board coordinates above
   url=$(gh issue create --repo davideimola/content-os --title "Calendar smoke test" \
     --body "temp — verifying the Calendar week view" | tail -1)   # gh prints the URL last
   item=$(gh project item-add 2 --owner davideimola --url "$url" --format json --jq .id)
   gh project item-edit --project-id <pid> --id "$item" --field-id <date-fid> --date <a-date-this-week>
   gh project item-edit --project-id <pid> --id "$item" --field-id <stage-fid> \
     --single-select-option-id <opt-id-for-slotted>
   ```

   Then run the **This week** recipe and confirm the test item is in its output, dated as set and
   staged `slotted`. (Verified on 2026-07-17 with throwaway issue #19.)
3. **Clean up:** `gh project item-archive 2 --owner davideimola --id "$item"` and
   `gh issue close <issue> --repo davideimola/content-os`.

## Seeding the real first entries

The three committed 2026 talks are on the board as `slotted` **Talk Pieces** — ComeToCode (#66, 26 Sep),
GoLab (#67, 1 Nov), reactjsday (#68, 19 Nov) — each dated by its conference date and linking its brief in
the [`presentations` Factory](../../CONTEXT.md) and its own **CFP** (#25 / #26 / #27, `cfp` + `talk`,
Outcome accepted — off the board, the submission record). The three blog Pieces (#36 / #37 / #38) sit
under their umbrella Ideas (#63 / #64 / #65), `proposed`, not yet slotted. Add each with the recipes above.
