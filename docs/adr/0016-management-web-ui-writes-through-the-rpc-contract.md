---
status: accepted
amends: [ADR-0002]
realizes: [ADR-0015]
---

# The management web UI: a mobile-first console that writes only through the RPC contract

> **Amended by [ADR-0021](0021-console-computes-facts-not-judgement.md):** the console's navigation goes
> from **six views to five** — Overview, Calendar, Ideas, Talks, Metrics — and the **Pipeline view
> dissolves**, removed and not replaced: measured against live data, its three post-`proposed` columns held
> exactly the 14 dated Pieces the Calendar already showed, the same set re-sorted by state. ADR-0021 also
> writes down the rule that governs every future addition — *the console computes facts about time and
> completeness and never weighs the value of content* — which **sharpens decision 2 below**: "never embeds
> the ~70% Flag mix" means never holding the *judgement*, so the console may show the distance to a target
> it does not own. Decisions 1 and 3 (RPC-only writes, no logic of its own) stand unchanged.

ADR-0002 decided content-os is deliberately **not software** — a repo plus routines — and left one door
open: *"if a visual dashboard is ever wanted, it must be additive (read-only over the same source), never a
second source of truth."* ADR-0014 then moved the source of truth to Supabase and ADR-0015 (decision 1)
went further, **contracting a front end**: *"the front end (later, additive) is a direct PostgREST /
`supabase-js` client over the same RPCs — it does not go through the MCP or the skills."*

This ADR builds that front end — **`content-os-web`**, a mobile-first console over the Pipeline — and, in
doing so, sharpens ADR-0002's open door. The real invariant of ADR-0002 was never "no code"; it was **"never
a second source of truth."** A console that **reads** Supabase and **writes only through the RPC verbs**
(ADR-0015) keeps that invariant intact while being genuinely useful — so it may be **read + write**, not
read-only. It is the twin of the MCP adapter: two clients of one contract, neither holding logic of its own.

## Decisions

1. **The UI is a client of the RPC contract, twin to the MCP.** Reads hit Supabase directly (views +
   tables); every write calls a **defined RPC verb** (`slot_piece`, `deslot_piece`, `decline_*`,
   `spawn_piece`, `archive_idea`, `capture_idea`, …). The UI holds **no editorial or persistence logic of
   its own**, so it cannot drift from the contract — the same property ADR-0015 gives the MCP adapter. This
   realizes ADR-0015 decision 1's "front end as a direct client of the same RPCs", not through the MCP.

2. **Read + write is allowed; the single-source-of-truth invariant is what's protected** (amends ADR-0002).
   ADR-0002's "read-only" clause is relaxed to: *a management UI may write, provided it writes only through
   the RPC contract.* Because Supabase stays the one source of truth and the RPCs are the one write path,
   there is no second source of truth — the concern ADR-0002 actually guarded is untouched. The UI does the
   **hands** work (slot / deslot / decline / capture, quick manual moves); the editorial **brain** stays in
   `/desk` and `/review` (ADR-0015 decision 5). The console never embeds the ~70% Flag mix, the Cadence
   judgement, or the amplifier rule.

3. **It lives in-repo, at the root — a monorepo, not a Factory.** `content-os-web` is **not** a Factory
   (`davideimola.dev`, `presentations`): it produces no content artifacts; it is the operations console
   bound to the schema and the RPC contract. Colocating it with `supabase/` keeps the contract and its
   client versioned together (a schema change and its UI move in one commit). It sits at the repo root
   (Next app files alongside `scripts/`, `supabase/`, `docs/`) — there is no `web/` subfolder and no formal
   pnpm workspace, because with one Node app a workspace earns nothing; promote to a workspace only if a
   second package (e.g. shared generated types) ever appears. content-os's "not-an-app" character is now
   preserved **by the invariant** (no second source of truth), not by the absence of code.

4. **The stack mirrors the blog Factory** so the muscle memory carries over: Next + TypeScript + Tailwind v4
   + Biome + pnpm, node/pnpm provisioned by **mise**. It adds **shadcn** (base-ui + lucide) — which the blog
   deliberately omits — because a management console (cards, dialogs, forms, actions) is exactly where a
   component kit earns its keep, unlike a typographic blog.

5. **`service_role` stays server-side; the app is single-user.** Writes and privileged reads run in Next
   Server Actions / Server Components holding `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (the same key the
   Beats use); the key never reaches the browser (`import "server-only"`). The deployed app is gated for a
   single user (Davide) — a later slice. Until then it runs locally / on the LAN. Trust is proportional
   (ADR-0015 decision 2): a leaked edit is a reversible change to one's own Pipeline.

## Considered Options

- **Keep it read-only (ADR-0002's original allowance).** Rejected: Davide wants to *manage* from the phone,
  and a read-only view would still need the Desk for every write — the console earns its keep only if it can
  act. The invariant that mattered (single source of truth) survives because writes go through the RPCs, so
  read-only buys nothing it protects.
- **A separate `content-os-web` repo, Factory-style.** Rejected: it is not a Factory (no content artifacts),
  and separating it would drift the client from the schema/RPC it depends on. Keeping "not-an-app" by
  banishing the code to another repo is theatre; the honest guarantee is the RPC-only write path.
- **Write via raw table `UPDATE`s / logic in the UI.** Rejected: that recreates the exact drift ADR-0015
  killed and would make the UI a second source of truth — the one thing ADR-0002 forbids.
- **Route the UI's writes through the MCP adapter.** Rejected: ADR-0015 decision 1 already says the front
  end is a *direct* client of the RPCs; the MCP is the **AI-app** door. Two clients of one contract, not a
  chain through a second service.

## Consequences

- **Amends ADR-0002** (a management UI may write, via the RPC contract; "never a second source of truth"
  stands) and **realizes ADR-0015 decision 1** (the contracted front end now exists).
- content-os gains a Node app at the root: `node`/`pnpm` in `mise.toml`, `package.json` + Next/Tailwind/
  shadcn/Biome, and a gitignored `.env.local` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY`). The Beats, Edge Functions, and migrations are untouched; `.gitignore` grows the
  Node/Next entries.
- **The "I Built a Tool I Don't Use" risk is real** — it is ADR-0002's core worry. It is mitigated by making
  the console **mobile-first** (reachable in the same reflex as the Telegram pings) and **thin** (hands, not
  brain — no new judgement to learn). If it still goes unused, it is deletable without touching the source of
  truth, exactly because it holds no state of its own.
- **Auth + Vercel deploy are a later slice**; the first slices run locally / on the LAN.
- **CLAUDE.md and `docs/agents/*` follow the code** as slices land (ADR-0015's doc rule). **CONTEXT.md is
  unchanged** — this is architecture, not domain language.
