# `capture-mcp` Edge Function — the content-os MCP operations adapter

The **operations adapter for AI apps** (ADR-0015). It grew out of the insert-only
capture door (ADR-0014): same narrow, hand-rolled JSON-RPC over **Streamable
HTTP**, but now the **single operations surface** for the skills and any AI app
(Claude, Perplexity, a phone). It is a **thin adapter** — it exposes reads (over
tables/views) and the write RPC verbs as tools, and holds **no logic of its own**,
so it can never drift from the Postgres contract
([`docs/design/supabase-foundations.md`](../../../docs/design/supabase-foundations.md)).
The front end talks to the same RPCs directly via PostgREST; this server is the
door for MCP-only clients.

> The folder/endpoint keeps the `capture-mcp` name so the live connectors are not
> broken — the server identity is now `content-os`.

## Endpoint

```
https://<project-ref>.supabase.co/functions/v1/capture-mcp
```

One URL, the MCP endpoint (Streamable HTTP): `POST` for JSON-RPC, `OPTIONS` for
CORS preflight. `GET` returns `405` (this server pushes no server-initiated
messages, so there is no SSE stream to open).

## The tools

The MCP surface implemented: `initialize`, `notifications/initialized`, `ping`,
`tools/list`, `tools/call`. The server is **stateless** (no `Mcp-Session-Id`).

**Reads** (over tables/views):

- **`list_ideas`** — the live Idea pool (`status = live`), oldest first.
- **`list_proposals`** — Pieces + Talks in state `proposed`, each tagged `kind`.
- **`list_calendar`** — dated Pieces (any with a `publish_date`), earliest first.

**Writes** (each wraps a `security definer` RPC, atomic):

- **`spawn_piece`** `(channel, flag_side, title, idea_ids?)` — a `proposed` Piece + source-Idea links.
- **`slot_piece`** `(id, publish_date)` — set `slotted` + date (also reslots).
- **`deslot_piece`** `(id)` — back to `proposed`, date cleared.
- **`decline_piece`** `(id)` — `declined`, kept on the record.
- **`spawn_talk`** `(flag_side, title, idea_ids?)` — a `proposed` Talk + source-Idea links.
- **`decline_talk`** `(id)` — `declined`, kept on the record.
- **`archive_idea`** `(id, reason, duplicate_of?)` — archive an Idea (reversible; out of the live pool).
- **`block_piece`** `(id, blocked_by)` — record that a Piece is blocked by another (blog → LinkedIn amplifier).
- **`set_piece_artifact`** `(id, url)` — point a Piece at its Factory draft (`pieces.artifact_url`).

**Capture** (the original door, still here):

- **`capture_idea`** `(spark, title?, source?)` — file a raw Idea, spark verbatim.

**Metrics** (the Review's ingest + reads):

- **`ingest_linkedin_metrics`** `(month, csv_text)` — deterministic parse of a LinkedIn export CSV, replacing that month's posts (idempotent). Replaces the retired `contentos metrics-ingest`.
- **`record_site_metrics`** `(month, visitors?, page_views?)` — upsert a month's site numbers.
- **`get_metrics`** `(month)` — a month's LinkedIn per-post metrics + site numbers.
- **`flag_mix`** / **`cadence_status`** — the editorial-mix and Cadence-floor views.

A tool success returns a text content block plus `structuredContent` (the JSON
payload is in the text too, so tools-only clients still see the data). A
failure — bad input, a DB/RPC error, an unknown tool — comes back as a **tool
error** (`isError: true`) carrying the message, not a JSON-RPC protocol error.

Editorial **judgement** (accept, the Flag mix, Cadence) is **not** here — it lives
in the caller's skill. This server is hands, not brain.

## Auth & trust model (ADR-0015 — one token, no gates)

Every request is authenticated against the shared **`CAPTURE_TOKEN`** secret,
compared constant-time, on **either** header:

- **`x-api-key: <CAPTURE_TOKEN>`** — primary (Claude's request-header allowlist;
  Perplexity's API-Key auth lands here).
- **`Authorization: Bearer <CAPTURE_TOKEN>`** — fallback.

Missing/wrong token → `401`. Missing `CAPTURE_TOKEN` env var → `500`.

The single token **is** the trust boundary. The server talks to the DB with the
**service_role** key (auto-injected as `SUPABASE_SERVICE_ROLE_KEY`), so it can run
the privileged verbs and read the base tables (service_role has `BYPASSRLS`). This
is deliberate (a personal content backlog): a leaked token can make a **reversible
edit to one's own Pipeline**, which is the accepted risk — so there are no tiers
and no second door. A distinct token **per surface** is used only as a free
revocation switch.

Defense in depth still holds around it:

- **`anon` reaches nothing here.** The privileged verbs are `revoke`d from
  `PUBLIC` and granted only to `service_role`, so the semi-public anon key (used
  by `davideimola.dev`) cannot call them via raw PostgREST. anon keeps exactly
  its old reach: `public_events` + the insert-only `capture_idea`.
- **The REST `capture-idea` function stays anon insert-only** for REST clients
  (ChatGPT Custom GPT Action / curl) — a leaked token there still inserts one Idea
  and nothing more.

If not already set (the REST door shares it):

```sh
supabase secrets set CAPTURE_TOKEN="$(openssl rand -hex 32)"
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are
auto-injected into Edge Functions — you do not set those.

## Streamable HTTP: JSON vs SSE

The spec lets the server answer as one JSON object or an SSE stream, and requires
clients to support both. This function negotiates on `Accept`:

- includes **`text/event-stream`** → **SSE** (one `message` event per response).
  This is what Perplexity and Claude send.
- otherwise (e.g. `Accept: application/json`) → a single **JSON** object.

Input that is solely notifications/responses gets `202 Accepted`, no body.

## Deploy

The function does its **own** auth, so Supabase's JWT gate must be off. It is set
in `supabase/config.toml`:

```toml
[functions.capture-mcp]
verify_jwt = false
```

(or deploy with `--no-verify-jwt`). One of the two is **required** — otherwise
Supabase rejects the request before our token check runs.

## Local dev & seam verification

```sh
supabase start
supabase db reset                       # applies all migrations locally
printf 'CAPTURE_TOKEN=dev-token\n' > /tmp/fn.env
supabase functions serve capture-mcp --env-file /tmp/fn.env
```

Then drive the seam (ask for `application/json` to avoid SSE):

```sh
MCP=http://127.0.0.1:54321/functions/v1/capture-mcp
# list the tools
curl -s -X POST "$MCP" -H 'content-type: application/json' -H 'accept: application/json' \
  -H 'x-api-key: dev-token' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# read the live Idea pool
curl -s -X POST "$MCP" -H 'content-type: application/json' -H 'accept: application/json' \
  -H 'x-api-key: dev-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_ideas","arguments":{}}}'
# spawn a proposed Piece
curl -s -X POST "$MCP" -H 'content-type: application/json' -H 'accept: application/json' \
  -H 'x-api-key: dev-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"spawn_piece","arguments":{"channel":"blog","flag_side":"flag","title":"My piece"}}}'
```

A wrong `x-api-key` returns `401`; `anon` cannot execute the privileged verbs even
with the raw anon key.

## Connectors

**Perplexity** — Settings → Connectors → *+ Custom connector*: Remote, Streamable
HTTP; URL = the endpoint; Authentication = **API Key** (`CAPTURE_TOKEN`, sent as
`x-api-key`).

**Claude** — Settings → Connectors → *Add custom connector*: Remote MCP server URL
= the endpoint; **Request headers** → `x-api-key` = `CAPTURE_TOKEN`. Header-based
auth on custom connectors is a Claude beta.
