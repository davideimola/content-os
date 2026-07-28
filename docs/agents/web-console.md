# content-os-web: the management console over the Pipeline

`content-os-web` is the **front end** contracted by
[ADR-0015](../adr/0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md) (decision 1 — *"the
front end is a direct client over the same RPCs, not through the MCP or the skills"*) and built by
[ADR-0016](../adr/0016-management-web-ui-writes-through-the-rpc-contract.md): a **mobile-first web console**
where Davide **sees and manages** the [Pipeline](../../CONTEXT.md) by hand. It reads
Supabase and **writes only through the RPC contract**, so it is the **twin of the MCP adapter** (two clients
of one contract), never a second source of truth.

**Mobile-first means the responsive sense, not mobile-only**
([ADR-0021](../adr/0021-console-computes-facts-not-judgement.md) decision 3). The phone is the *first*
density, not the only one, and the rule is **same view, same question, different density**: a wide screen
may legitimately be **denser** — the Calendar puts its lane beside the agenda where a phone stacks it above,
Ideas and Talks lay cards in columns where a phone gets one — but it must not answer a different question
and must not carry an element the phone lacks. So there is no desktop-only view and no phone-only view, and
where an element's legibility is in doubt the **phone is the deciding test** (the theme concept map stayed
because it read at a true 390px viewport).

**What the console may show** is the other half of ADR-0021 (decision 1), the rule every view below was
built against: it may **derive** facts about **time and completeness** — arithmetic over dates, states, the
presence or absence of a field, counts against a target stated elsewhere — and **report** numbers **of
record, unranked**. It never weighs the value of content: there is no suggestions block anywhere, nothing
ranks an Idea or a proposal, and no list of output is sorted by how well it did. Where the console overlaps
a [Beat](../../CONTEXT.md), the **Beat's definition wins** (decision 5): Cadence *covered* means a slot
exists, read from the same `cadence_status` view, and the console adds facts **beside** it instead of
redefining the predicate.

It is **not** a [Factory](../../CONTEXT.md) (it produces no content artifacts) and **not** the
[Desk](../../CONTEXT.md): the Desk is the editorial **brain** (correlation + judgement by the
[editorial signals](editorial-signals.md)); the console is **hands** — quick manual moves (capture a spark,
slot / deslot / decline, mark ready / shipped, climb the Talk ladder, record a submission's outcome, correct
free text and Themes). They coexist. This is why [ADR-0016](../adr/0016-management-web-ui-writes-through-the-rpc-contract.md)
could relax [ADR-0002](../adr/0002-no-app-repo-plus-claude-routines.md)'s "read-only dashboard" clause: the
invariant ADR-0002 actually guards — *never a second source of truth* — is preserved because every write is
an RPC call and the UI holds no logic of its own.

## Where it lives, and the stack

It sits **at the repo root** (a monorepo — the Next app files alongside `scripts/`, `supabase/`, `docs/`):
one Node app doesn't earn a `web/` subfolder or a formal pnpm workspace; promote to a workspace only if a
second package (e.g. shared generated types) ever appears. content-os's "not-an-app" character is now kept
**by the invariant**, not by the absence of code.

The stack **mirrors the `davideimola.dev` Factory** so the muscle memory carries over — **Next 16 + TS +
Tailwind v4 + Biome + pnpm**, `node`/`pnpm` provisioned by **mise** — plus **shadcn** (base-ui + lucide),
which the blog deliberately omits but which earns its keep on a console (cards, dialogs, forms, actions).

## Views & navigation

An **app shell** (`src/components/shell/app-shell.tsx`) wraps every route: a **sidebar** on desktop and a
**bottom tab bar** on mobile (the `lg` breakpoint switches them, and the tab bar counts its columns from
`NAV.length`), plus the sign-out control. It is a client component (active-link state via `usePathname`); the
signed-in user comes from `auth()` in the root layout.

There are **five** views (nav order in `src/lib/nav.ts`). Each one earns its place by ADR-0021 decision 2 —
you **correct something** there, **notice a delay** there, or **understand how things are going** there.

- **Overview** (`/`) — the dashboard, in one order: how it is going, what is being produced, the floors, the
  week, then what is waiting. A **"This month on LinkedIn"** tile row (impressions / members reached /
  engagements with month-over-month deltas, plus the follower **level** carrying the date it was observed and
  the month's growth beside it — ADR-0019, #113) with two mini charts (cumulative follower growth, and the
  impressions trend); **"What I'm producing"** — output per month, shipped against planned, the realized
  Flag/Side split against its ~70% target, and how much of what is dated is actually written
  (`src/components/production.tsx`); the **Cadence strip**; **"Next 7 days"** (a *rolling* window, `HomeAgenda`)
  beside **"Missing ahead"** — the weeks and months on both floors that hold nothing
  (`src/components/cadence-gaps.tsx`); and **"To judge"**, the undated proposals as equal-height cards.
  Readiness marks (`late` / `in the can` / `missed` / …) come from `src/components/readiness.tsx`.
- **Calendar** (`/calendar`) — the by-date view: Piece publish dates + CFP deadlines + Event dates, **grouped
  by month with day rows**, the past behind a `<details>` that is collapsed by default and **opened by any
  active search**, so a match the reader asked for is never hidden behind a closed section
  (`src/components/calendar-view.tsx`). A **lane** — sticky beside the
  agenda on desktop, stacked above it on a phone — holds the two facts that justify each other: the outputs
  waiting for a date (*To place*), the gap chips for both Cadence floors, and the submissions with **no
  deadline** (with the reason they cannot appear here). A **search box** matches a row's **name** only, never
  its channel — "linkedin" returning every LinkedIn Piece would be a filter wearing a search box. **No row
  type is second class**: a CFP deadline or an Event carries a glyph and a state in the same columns a Piece
  row uses, and every row opens the drawer of what it stands for. The domain's Calendar (CONTEXT.md) over
  Supabase — what can eventually retire the hand-maintained GitHub Projects board.
- **Ideas** (`/ideas`) — the pool as the view that **repairs** it (`src/components/ideas-view.tsx`): a
  **"Just captured"** band (age plus never-edited, both facts already on the record) above the older
  **"Candidates to work"**, cards carrying their **Themes** (one with none says so), theme filter chips that
  count what they will actually show plus a **no-theme** chip that turns the gap into a tagging queue, a
  search box, a used / never-used filter, and the console's own **capture door**
  (`src/components/detail/capture-idea.tsx`).
- **Talks** (`/talks`) — the Talk as an **asset** (`src/components/talks-view.tsx`): one sheet per Talk in a
  grid, with its **CFP submissions inside it**, which is what makes the model's one-to-many (one Talk, many
  Engagements, each to its own Event) visible at all. The header opens the Talk's drawer — where the ladder
  (`start_talk_production` / `mark_talk_ready`) lives — each submission row opens the Engagement's, and
  **"Submit to an event"** (`src/components/detail/submit-to-event.tsx`) creates the Engagement, minting the
  Event inline if it does not exist yet. A `direct` invitation gets no surface, and the sheet **states the
  count it is not showing** so the omission is never silent.
- **Metrics** (`/metrics`) — the "how is it going" view, in panels rather than one table
  (`src/components/metrics-panels.tsx`, `src/components/metrics-rows.tsx`): the month's tiles; **"What is
  measured"**, which is the explanation for every empty cell below it; **"Themes on the output"** — a
  deterministic dependency-free inline-SVG concept map plus a scoreboard (`src/components/theme-map.tsx`),
  where every edge weight is **also plain text**, because a phone has no hover; **per Piece**, ordered by
  **date** and deliberately not by impressions (which output did well is the Desk's sentence, not the
  console's); the LinkedIn **posts measured**, ordered by the figure LinkedIn measured (those are the
  measurements, not the output); which Ideas became output; `published` Pieces with **no artifact URL**; the
  follower block; and the month-by-month table with the site trend. Trend charts are dependency-free inline
  SVG (`src/components/trend-chart.tsx`), the follower curve is **cumulative growth** and the absolute level
  is stated separately with its observation date (#113). Pure read.

### The Pipeline board is dissolved

There used to be a sixth view, `/pipeline`: the lifecycle board, one column per state. It is **removed and
not replaced** (#116, ADR-0021 decision 2, recorded as an amendment at the head of ADR-0016). Measured
against live data — 18 Pieces, of which 14 dated (`slotted`/`ready`/`published`), 3 `proposed` and 1
`declined` — dropping the `proposed` column left three columns holding exactly the 14 items the Calendar
already showed, the same set re-sorted by state. Every Piece has a better home: dated ones on the Calendar,
proposals in the Overview's "To judge". `GET /pipeline` is now a 404. The **shared card and badge components
stayed** in `src/components/pipeline.tsx` (that module is the console's shared vocabulary, not the deleted
view), and `MetricTile` is the only tile primitive left.

## The console is the third capture door

Since #118 the console captures Ideas, which makes it the **third capture door** onto the Pipeline beside
the machine-side [`/idea` skill](idea.md) and the [AI apps](app-capture.md) — a spark noticed while looking
at the pool should not need another door. It writes through the same `capture_idea` verb, with
**`source = 'console'`** (a value the other doors' `skill` / app names now sit beside), so where a spark came
from stays legible on its card.

It keeps the doors' shared invariant **minus the summarizing**: the spark is stored **verbatim** as the body
and there is **no judgement at capture** — no channel, no flag, no Theme, no date, all of them the Desk's
questions. What the other two doors do with an LLM (distil a readable title) this door **asks for**, because
the console has no model and must not gain one (ADR-0002): the title is optional, and an Idea without one
falls back to its body wherever it is shown. The Idea it creates is zero days old and never edited, so it
appears at the head of the Ideas view's **"Just captured"** band the moment the write revalidates — captured
and repairable in the same place.

## Where the derived facts live

Two **pure, directive-free** modules, callable from both sides of the RSC boundary — neither carries
`"use client"` or `server-only`, because a Server Component builds these facts and a client row component
displays them:

- **`src/lib/derive.ts`** — the sanctioned arithmetic ADR-0021 decision 1 permits, and the only place it is
  written: readiness (`readinessOf` / `readinessById` → `shipped` / `missed` / `in the can` / `late` /
  `not written` / `declined`), `writtenVsDated`, `outputByMonth`, both hole projections
  (`linkedinHolesAhead` / `blogHolesAhead`), the agenda window (`agendaWindowRows`), the Idea pool's bands
  (`ideaTriage`, `isJustCaptured`, `isCandidateToWork`, `ideaAgeDays`, `neverEdited`, `hasLiveTheme`), the
  metrics completeness facts (`metricsCoverage`), the Theme co-occurrence graph (`themeGraph` /
  `themeDegree`), the display cap helper (`capped`), and **`todayISO()`** — the console's one "today", a
  **local** calendar date rather than a UTC instant, because week and month boundaries are the point.
  Every tuning number lives in one **`TUNING`** object **with the reason for its value**, so moving one is a
  one-line change with a visible blast radius. Two of them matter to read correctly: the home's week is a
  **rolling 7 days** while the Cadence floors stay on **calendar periods** (two questions, two answers —
  `covered` is defined on Monday-anchored weeks by `cadence_status`, and the console may not re-phase it),
  and the hole horizon has **two values on purpose** (`linkedinHoleWeeks: 8` for the home's glance,
  `calendarHoleWeeks: 12` where a date actually gets placed) — the *same* predicate over a different
  window, so the two surfaces can never contradict each other.
- **`src/lib/rows.ts`** — the row model and the by-date projection: `calendarItems(pieces, engagements)` is
  pure (there is **no** `getCalendarItems()` read any more — it was retired, not kept as a delegator, and the
  Calendar and the home each dropped three duplicate queries), plus `buildRows`, `groupRowsByDate` /
  `groupRowsByMonth`, the Engagement selectors (`cfpSubmissionsOfTalk`, `invitationsOfTalk`,
  `cfpsWithoutDeadline`), `undatedProposals`, and `eventTalkReadiness` — an Event row's state is its Talk's
  readiness, **least ready wins**, decided once here so the home's agenda inherits it for free.

Anything derived is computed **server-side, beside the render that decided what `today` is**, and handed
down (`AgendaRow`'s `readiness` prop, the `readinessById` record): that is what stops a client and a server
disagreeing about a date. Lookup context crosses the RSC boundary **only as plain records — never a `Map`**,
which does not survive the payload.

## Branding

Favicon (`src/app/icon.svg`), home-screen icon (`src/app/apple-icon.png`), and the sidebar/top-bar logo
(`public/brand/mark.svg`) are the personal **`di` mark** (with the red Akane cursor) taken from the
`davideimola.dev` brand (CC BY-ND, `public/brand/LICENSE.md`). Colours are the neutral shadcn theme — the
only brand accent is the mark's red cursor. The header reads **Editorial HQ · davideimola.dev**.

## The seams

- **Reads** — server-side only, in Server Components (`src/lib/pipeline.ts`), via a `service_role`
  `supabase-js` client (`src/lib/supabase/server.ts`, marked `import "server-only"` so it can never reach
  the browser). It reads the same views the Beats use (`cadence_status` via `getCadence`, `flag_mix` via
  `getFlagMix`) plus the base tables. Several reads are deliberately **whole-context** so a view asks each
  table once: `getPieces()` returns `PieceWithBlocker[]` (the blocking Piece resolved to a **title**, since
  the cue is illegible without it), `getIdeaPool()` is the Ideas view's single read (the pool plus the
  vocabulary and which Themes are carried by anything at all), `getThemeContext()` hands every drawer the
  vocabulary plus `byPiece` and `inUse` (spanning **both** joins), `getEngagementContext()` reads the
  Engagement tier whole as plain records, and `getMetricsContext(pieces)` covers the Metrics view's four
  panels from one read of the three metrics tables. `MonthlyMetrics.li_engagements` is
  **`number | null`** — a month with no per-post rows is *not ingested*, never *zero engagements*, and
  nothing downstream may turn that absence into a number (#120).
- **Writes** — Next **Server Actions** (`src/lib/actions.ts`) call the **RPC verbs** and
  `revalidatePath("/", "layout")` (a write shows across every view). No raw table `UPDATE`s: the UI cannot
  drift from the contract, the same property the MCP adapter has. The verbs the console calls, all of them:
  - **Piece lifecycle** — `slot_piece` / `deslot_piece` / `decline_piece` / `mark_ready` / `publish_piece`,
    plus `set_piece_artifact` and `set_piece_linkedin_url`.
  - **Talk ladder** — `start_talk_production` / `mark_talk_ready` (#115), `{proposed, ready} → in_production`
    and `in_production → ready`, both from-state guarded server-side, with `declined` reachable only through
    `decline_talk`. The console is their **only** caller: the Desk judges and routes, it does not build decks.
  - **Capture & Ideas** — `capture_idea` (with `source = 'console'`, see *the third capture door* above) and
    `archive_idea`.
  - **Free text** — `edit_idea(id,title,body)` / `edit_piece(id,title)` / `edit_talk(id,title)` (added by
    `supabase/migrations/20260721150000_edit_text_verbs.sql`). **The rule holds even for editing:** free-text
    edits are a contract change (a new verb), never a UI-only write.
  - **Themes** — `create_theme` / `archive_theme` / `set_idea_themes` / `set_piece_themes`, all through the
    one `ThemeTagger` control (`src/components/detail/theme-tagger.tsx`, a creatable multi-combobox) with a
    `target: {kind:"idea"|"piece"}` discriminator so the verb mapping lives in one place. **Minting is
    deliberately a hand act**: `create_theme` / `archive_theme` are the two verbs the MCP adapter does *not*
    expose, because an LLM handed a create verb grows the vocabulary until it stops meaning anything (#121).
    The reciprocal gap: `merge_themes` — the vocabulary's repair — has **no console surface**, so a fold is
    driven from the adapter, and nothing on either surface un-archives a Theme.
  - **Engagement tier** — `create_event` / `create_engagement` / `set_engagement_outcome` (#114), wired as
    `createEvent` / `createEngagement` / `setEngagementOutcome`; `createEvent` returns the new id so
    "create the Event inline" can immediately submit against it. Nothing gives an **existing** Engagement a
    deadline (there is no `set_engagement_deadline` / `edit_engagement`), which is why the Calendar's lane
    lists submissions with no deadline as a standing fact rather than a queue to work.

  `set_piece_linkedin_url` ([ADR-0019](../adr/0019-linkedin-metrics-contract-follows-the-aggregate-export.md),
  guarded to `channel = 'linkedin'`) ties a Piece to its LinkedIn post so the per-Piece metrics cross can
  join by URL. MCP-adapter parity for the edit verbs, the lifecycle-advance verbs and this one (so the
  Desk/AI apps could use them too) is a later additive step.
  `publish_piece` ([ADR-0017](../adr/0017-publish-verb-advances-a-piece-to-published.md)) is the first
  **lifecycle-advance** verb, and `mark_ready` ([ADR-0018](../adr/0018-ready-replaces-in-production-on-the-piece-lifecycle.md))
  the second: `mark_ready` does `slotted → ready` (written, awaiting its date), and `publish_piece` does
  `{slotted, ready} → published` (ADR-0018 widened it from slotted-only). Both are guarded server-side and
  keep the publish_date the monthly Review reads. The **console is their only caller** (the Desk stays
  pre-publish; no MCP tool yet — no MCP consumer advances).
- **Detail drawers** — a card or a row opens a detail surface (`src/components/detail/*`): a right Sheet on
  desktop, a bottom sheet on mobile (`useMediaQuery` picks the side). They share **one opener contract**
  (`DetailTrigger`, with the `CardTrigger` / `RowTrigger` primitives — a row's callback cannot cross the RSC
  boundary, which is why every row component is a client module while the row *model* stays pure in
  `rows.ts`): omit a `trigger` and the thing's own card opens the drawer, supply one and a row does, so the
  **same drawer with the same actions** is reachable wherever the thing appears.
  - **`PieceDetail`** — the full record plus edit (title), schedule (slot/reslot/deslot), **mark ready**
    (`slotted` only), **mark shipped** (`slotted`/`ready`), artifact URL, decline, and its **Themes**. For a
    **LinkedIn Piece** it links its LinkedIn post and shows its impressions + engagements summed across
    months (the per-Piece cross, ADR-0019); for a **blog Piece**, the publish month's **site-wide** visitors
    (there is no per-post site metric).
  - **`IdeaDetail`** — the verbatim body, its provenance (the Pieces it became), age, Themes, edit
    (title/body — the repair occasion) and archive.
  - **`TalkDetail`** — the Talk's fields, the **ladder** (start production / mark ready) and decline.
  - **`CfpDetail`** / **`EventDetail`** (`src/components/detail/engagement-detail.tsx`) — the Engagement
    tier. `CfpDetail` is **where a submission's outcome is recorded** (#119), and it is the drawer every
    submission row opens — on a Talk's asset sheet and on the Calendar alike — so the one fact has one place
    it is set; the verb has **no transition guard** on purpose, because an outcome records a decision made
    outside the system and a mis-tap has to be repairable. `EventDetail` stays **read-only**: an Event has no
    edit verb, deliberately (#114). Neither has a canonical card, so their `trigger` is **required** — the
    caller always brings its own row.
  - **`SubmitToEvent`** and **`CaptureIdea`** are the two **creation** drawers (a Talk's submission to an
    Event, and a spark).

  Cards and rows are clean triggers; no inline buttons.
- **Auth** — a single-user gate (`src/auth.ts`, `src/proxy.ts`): **Auth.js v5 + Google**, no password,
  restricted to an email allowlist (`AUTH_ALLOWED_EMAIL`). Chosen over Supabase Auth (we need no per-user
  RLS — data access is `service_role`) and over Vercel Authentication (which only protects production on
  paid plans). The gate **stays open until `AUTH_GOOGLE_ID` is set**, so local / pre-setup dev is not
  locked out; once configured it redirects unauthenticated requests to Google sign-in. Next 16 renamed the
  `middleware` file convention to **`proxy`**.

## Environment

`.env.local` (gitignored; see `.env.local.example`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — same names the Beats use. Locally,
  pull them with the Supabase CLI; on Vercel the **Supabase integration** provides them automatically.
- `AUTH_SECRET` (`openssl rand -base64 33`), `AUTH_ALLOWED_EMAIL`, and — to turn the gate on —
  `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` from a Google OAuth app (redirect URI
  `<origin>/api/auth/callback/google`).

## Running & deploying

```sh
mise install        # node + pnpm
pnpm install
pnpm dev            # http://localhost:3000 (also on the LAN for the phone)
```

Deploy is **Vercel**: import the repo (root = `content-os`), add the Supabase integration for the Supabase
env vars, set the `AUTH_*` vars by hand, point a subdomain at it, and add that origin to the Google OAuth
redirect URIs. Deploy is a manual, outward-facing step Davide drives with his own accounts.

## Verification

No unit tests — verified at the seams, the same discipline as the rest of content-os:

- **Read** — drive the page and assert it renders the live Pipeline (a known Piece title, the cadence
  pills, the Flag mix).
- **Write** — a `slot → deslot` round-trip through the UI (Server Action → RPC → `revalidatePath`), then
  assert the Piece returned to `proposed` in the DB (state restored; only `updated_at` bumps).
- **Ready & publish** — from a `slotted` Piece, "Mark ready" moves it to `ready` (keeps its date), and "Mark
  shipped" moves a `slotted`/`ready` Piece to `published` (keeps its date). "Mark ready" is absent off
  `slotted`; `mark_ready` off `slotted` and `publish_piece` off `slotted`/`ready` raise. A `ready` Piece can
  "Deslot" back to `proposed`. Restore the seed with `deslot_piece` (→ `proposed`).
- **Gate** — with Google configured, an unauthenticated `GET /` must `307` to `/api/auth/signin`; with it
  unconfigured, `GET /` must be `200` (dev stays open).
- **The phone check** — every view is checked once at a real narrow viewport, because the phone is the
  deciding test for legibility (ADR-0021 dec.3). Do it with CDP `Emulation.setDeviceMetricsOverride` at
  390×844 and **assert `document.documentElement.scrollWidth === 390`**. `chrome --headless
  --window-size=390,H` is **not** a phone check: on macOS the width is silently clamped (~500px layout) and
  the screenshot merely clips, so a view can pass at a width it was never rendered at.
