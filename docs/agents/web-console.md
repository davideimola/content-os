# content-os-web: the management console over the Pipeline

`content-os-web` is the **front end** contracted by
[ADR-0015](../adr/0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md) (decision 1 — *"the
front end is a direct client over the same RPCs, not through the MCP or the skills"*) and built by
[ADR-0016](../adr/0016-management-web-ui-writes-through-the-rpc-contract.md): a **mobile-first web console**
where Davide **sees and manages** the [Pipeline](../../CONTEXT.md) by hand — from the phone. It reads
Supabase and **writes only through the RPC contract**, so it is the **twin of the MCP adapter** (two clients
of one contract), never a second source of truth.

It is **not** a [Factory](../../CONTEXT.md) (it produces no content artifacts) and **not** the
[Desk](../../CONTEXT.md): the Desk is the editorial **brain** (correlation + judgement by the
[editorial signals](editorial-signals.md)); the console is **hands** — quick manual moves (slot / deslot /
decline, and later capture / spawn). They coexist. This is why [ADR-0016](../adr/0016-management-web-ui-writes-through-the-rpc-contract.md)
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
**bottom tab bar** on mobile (the `lg` breakpoint switches them), plus the sign-out control. It is a client
component (active-link state via `usePathname`); the signed-in user comes from `auth()` in the root layout.
The views (nav order in `src/lib/nav.ts`):

- **Overview** (`/`) — cadence, Flag mix, stat tiles, a **"This month on LinkedIn"** tile row (impressions
  / members reached / engagements with month-over-month deltas, plus the follower **level** carrying the
  date it was observed and the month's growth beside it — ADR-0019, #113), the "to judge" proposals, and
  the next dated items.
- **Pipeline** (`/pipeline`) — the lifecycle board (proposed → slotted → ready → published), one
  column per state; the write actions live on the Piece cards.
- **Calendar** (`/calendar`) — the by-date agenda (`getCalendarItems`): Piece publish dates + CFP deadlines
  + Event dates, grouped by day, upcoming then past. The domain's Calendar (CONTEXT.md) over Supabase — it
  is what can eventually retire the hand-maintained GitHub Projects board.
- **Ideas** (`/ideas`) — the live Idea pool.
- **Talks** (`/talks`) — the Talks.
- **Metrics** (`/metrics`) — the month-by-month trend over LinkedIn + site (`getMonthlyMetrics`): a table
  (impressions / reach / engagements / new followers / site visitors / page views) plus dependency-free
  inline-SVG trend charts (`src/components/trend-chart.tsx`), where the follower curve is **cumulative
  growth** and the absolute level is stated separately with its observation date (#113). The accessible
  "table view" for the Overview's mini charts (ADR-0019). Pure read.

## Branding

Favicon (`src/app/icon.svg`), home-screen icon (`src/app/apple-icon.png`), and the sidebar/top-bar logo
(`public/brand/mark.svg`) are the personal **`di` mark** (with the red Akane cursor) taken from the
`davideimola.dev` brand (CC BY-ND, `public/brand/LICENSE.md`). Colours are the neutral shadcn theme — the
only brand accent is the mark's red cursor. The header reads **Editorial HQ · davideimola.dev**.

## The seams

- **Reads** — server-side only, in Server Components (`src/lib/pipeline.ts`), via a `service_role`
  `supabase-js` client (`src/lib/supabase/server.ts`, marked `import "server-only"` so it can never reach
  the browser). It reads the same views the Beats use (`cadence_status`, `flag_mix`, …) plus the base
  tables.
- **Writes** — Next **Server Actions** (`src/lib/actions.ts`) call the **RPC verbs** and
  `revalidatePath("/", "layout")` (a write shows across every view). No raw table `UPDATE`s: the UI cannot
  drift from the contract, the same property the MCP adapter has. Verbs used: `slot_piece` / `deslot_piece` /
  `decline_piece` / `mark_ready` / `publish_piece` / `set_piece_artifact` / `set_piece_linkedin_url` /
  `decline_talk` / `archive_idea`, plus the
  free-text edit verbs `edit_idea(id,title,body)` / `edit_piece(id,title)` / `edit_talk(id,title)` (added by
  `supabase/migrations/…_edit_text_verbs.sql`). **The rule holds even for editing:** free-text edits are a
  contract change (a new verb), never a UI-only write — the console is still just a client of the verbs.
  `set_piece_linkedin_url` ([ADR-0019](../adr/0019-linkedin-metrics-contract-follows-the-aggregate-export.md),
  guarded to `channel = 'linkedin'`) ties a Piece to its LinkedIn post so the per-Piece metrics cross can
  join by URL. MCP-adapter parity for the edit verbs + this one (so the Desk/AI apps can use them too) is a
  later additive step.
  `publish_piece` ([ADR-0017](../adr/0017-publish-verb-advances-a-piece-to-published.md)) is the first
  **lifecycle-advance** verb, and `mark_ready` ([ADR-0018](../adr/0018-ready-replaces-in-production-on-the-piece-lifecycle.md))
  the second: `mark_ready` does `slotted → ready` (written, awaiting its date), and `publish_piece` does
  `{slotted, ready} → published` (ADR-0018 widened it from slotted-only). Both are guarded server-side and
  keep the publish_date the monthly Review reads. The **console is their only caller** (the Desk stays
  pre-publish; no MCP tool yet — no MCP consumer advances).
- **Detail drawer** — tapping a card opens a detail surface (`src/components/detail/*`): a right Sheet on
  desktop, a bottom sheet on mobile (`useMediaQuery` picks the side). It shows the full content (an Idea's
  verbatim body, a Piece/Talk's fields + links) and hosts the actions above: edit (title/body), schedule
  (slot/reslot/deslot), **mark ready (slotted Pieces)**, **publish (mark shipped — slotted/ready Pieces)**,
  artifact URL, decline, archive. For a **LinkedIn Piece** it also **links its LinkedIn post and shows its
  impressions + engagements** summed across months (the per-Piece cross, ADR-0019); for a **blog Piece** it
  shows the publish month's **site-wide** visitors (there is no per-post site metric).
  Cards are clean triggers; no inline buttons.
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
