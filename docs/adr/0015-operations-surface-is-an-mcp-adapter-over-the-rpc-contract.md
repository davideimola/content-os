---
status: accepted
supersedes: [ADR-0009]
---

# The operations surface is one MCP adapter over the RPC contract; the CLI retires; skills become thin clients

ADR-0014 moved the source of truth to Supabase and made the system API-first, defining the **RPC verbs**
as the contract and — decision 6 — the **official Supabase MCP** as the trusted/local operations door.
We grilled that against a proposal to make "an MCP server the focal operations surface" and sharpened it:
the single source of truth for operations is the **Postgres RPC contract**, not any MCP; **one MCP server
of our own** is a *thin adapter* over those RPCs that lets any AI app (Claude, Perplexity, …) and the
skills drive the Pipeline; the **`contentos` Go CLI retires entirely**; and the editorial **brain** stays
in the Claude skills until portability actually demands otherwise. This is a personal content system, so
the design is deliberately proportional — no trust gates beyond a single token.

## Decisions

1. **Three levels, one source of truth.**
   - The **Postgres RPC verbs** (`spawn_piece`, `slot_piece`, `decline_*`, `archive_idea`,
     `create_engagement`, …) are the single operations contract: logic, atomic transactions,
     `security definer`.
   - **One MCP server** ("content-os") is a **thin adapter** that exposes those verbs as tools with
     descriptions. It holds **no logic of its own**, so it cannot drift from the contract.
   - The **front end** (later, additive) is a **direct** PostgREST / `supabase-js` client over the *same*
     RPCs — it does **not** go through the MCP or the skills.

   The MCP earns its place as the **AI-app adapter**, never as a second home for logic. If it ever held
   logic the front end lacked, we would have re-created the drift this redesign kills.

2. **One MCP server, one token, no gates.** The server exposes every tool — `capture_idea` plus the
   privileged verbs plus `ingest_linkedin_metrics` and `set_piece_artifact` — and authenticates callers
   with a single shared token that may live wherever Davide works (Claude Code, Perplexity, a phone). No
   tiered tokens, no second door: this is a personal content backlog, a leaked token's blast radius is a
   reversible edit to one's own Pipeline, and physical trust separation would be ceremony. A distinct
   token **per surface** is used only as a free revocation switch. The existing `capture-mcp` Edge
   Function **grows into** this server (it stops being anon-only and uses a key that can call every verb).

3. **Our own least-privilege MCP, not the official Supabase MCP** (supersedes ADR-0014's decision-6
   mechanism). The official Supabase MCP grants broad, admin-grade DB access; our adapter exposes **only
   the defined verbs**, so it is least-privilege *by construction* and safe to point at from a third-party
   cloud. Security — not only portability — is why the bespoke server earns its keep.

4. **The `contentos` Go CLI retires entirely** (supersedes ADR-0009). Its two remaining commands find
   other homes: `open` becomes a bookmark / the front-end URL; `metrics-ingest` becomes the MCP tool
   **`ingest_linkedin_metrics(csv_text)`** — the `/review` skill's LLM guides the export and passes the
   file's contents, and the **server** does the deterministic parse-and-insert. Determinism is preserved
   (server code, not an LLM); ADR-0009's git-diff objection **dissolves**, because metrics now live in the
   DB, not in committed files. Cost: the `internal/metrics` parser and its golden test are reimplemented
   in TypeScript inside the Edge Function.

5. **Skills are thin clients; the editorial brain stays in the Claude skills for now.** `/idea`, `/desk`,
   `/review` (and the Factory skills) call the MCP tools instead of embedding operations — the **hands**
   are de-drifted by the tools. The editorial **brain** (`editorial-signals.md`: the accept judgement,
   the ~70% Flag mix, Cadence, the LinkedIn-amplifier rule) is *not* a deterministic tool; it stays in the
   Claude `/desk` and `/review` skills, which read the repo docs directly. It is **not** duplicated across
   apps, because the other apps run only brain-less capture. If Davide starts running the Desk from a
   non-Claude app often, the brain is **promoted** to an MCP resource or a `get_editorial_guidance` tool
   (which works on any MCP client) — an additive change, not a rewrite.

6. **The Factories are clients of the same MCP.** `davideimola.dev` and `presentations` drive the Pipeline
   through the same server: advancing Piece/Talk state and writing back a content pointer via
   **`set_piece_artifact(piece_id, url)`** into the existing `pieces.artifact_url` (no schema change —
   the column already exists). This also gives the migrated blog briefs (#36/#37/#38) their home: their
   `artifact_url` points at the Factory draft.

## Considered Options

- **Two physical doors / a tiered-token server** (capture insert-only vs privileged ops). Rejected as
  ceremony for a personal backlog: the capture token already lives in a third-party cloud, and Davide
  *wants* to run the privileged Desk from there too — so a gate guarding against exactly that is pointless.
- **Keep ADR-0014's "official Supabase MCP" for trusted ops.** Rejected: admin-grade access is broader
  than the Desk needs and unshippable to a third-party cloud; our verb-only adapter is least-privilege.
- **Make the MCP the source of truth / put logic in it.** Rejected: the front end (direct PostgREST) and
  the MCP would diverge — the exact drift being killed. The RPC contract is the one source; the MCP is a
  thin wrapper.
- **Keep the CLI for `metrics-ingest`** (ADR-0009's position). Reversed: with metrics in the DB the
  byte-stable-git-diff argument is moot, and a server-side deterministic parse keeps the only property that
  mattered while removing the last reason to ship a Go binary.
- **Serve the editorial brain from the MCP on day one.** Deferred: the brain is effectively Claude-only
  today (Review needs the local export; the Desk is "mostly Claude"), so serving it now is future-proofing
  a rare case. Promote when the case is real.

## Consequences

- **Supersedes ADR-0009** (the CLI does not narrow — it retires) and **supersedes in part ADR-0014's
  decision 6** (the trusted door is our own adapter, not the official Supabase MCP). Completes the long
  supersession of ADR-0003's "the operations surface is a Go CLI": the operations surface is now the MCP
  adapter over the RPC contract.
- **Build order (a Fase-4 slice):** implement the write RPC verbs (already contracted in the design doc),
  grow `capture-mcp` into the full `content-os` MCP server, add the metrics + artifact tools, then thin the
  skills to call them. `pieces.artifact_url` already exists — no schema change for the write-back.
- **`CONTEXT.md` is unchanged** — this is architecture, not domain language (Idea/Piece/Talk/Engagement/
  Event are untouched).
- **CLAUDE.md and `docs/agents/*` follow the code**, section by section, as each component lands — they
  describe the *built* system, so updating them ahead of the build would re-introduce the doc/code drift
  this decision exists to kill.
- **`docs/design/supabase-foundations.md` is updated now** to record the ops-MCP door, the
  `ingest_linkedin_metrics` / `set_piece_artifact` verbs, and the front-end-as-direct-client note.
