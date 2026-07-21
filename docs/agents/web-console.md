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

- **Overview** (`/`) — cadence, Flag mix, stat tiles, the "to judge" proposals, and the next dated items.
- **Pipeline** (`/pipeline`) — the lifecycle board (proposed → slotted → in_production → published), one
  column per state; the write actions live on the Piece cards.
- **Calendar** (`/calendar`) — the by-date agenda (`getCalendarItems`): Piece publish dates + CFP deadlines
  + Event dates, grouped by day, upcoming then past. The domain's Calendar (CONTEXT.md) over Supabase — it
  is what can eventually retire the hand-maintained GitHub Projects board.
- **Ideas** (`/ideas`) — the live Idea pool.
- **Talks** (`/talks`) — the Talks.

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
- **Writes** — Next **Server Actions** (`src/lib/actions.ts`) call the **RPC verbs** (`slot_piece`,
  `deslot_piece`, `decline_piece`, …) and `revalidatePath("/")`. No raw table `UPDATE`s: the UI cannot
  drift from the contract, the same property the MCP adapter has. **Consequence:** the UI can only do what a
  verb allows. There is **no free-text edit verb** (no `edit_idea`/`rename_piece`), so editing an Idea body
  or a Piece/Talk title is **not a UI-only change** — it needs a new RPC verb (a migration, and MCP-adapter
  parity) first. A detail **drawer** (view full content + surface the existing verbs — reslot, set-artifact,
  block) is the planned next slice; true content editing is the slice after, gated on those new verbs.
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
- **Gate** — with Google configured, an unauthenticated `GET /` must `307` to `/api/auth/signin`; with it
  unconfigured, `GET /` must be `200` (dev stays open).
