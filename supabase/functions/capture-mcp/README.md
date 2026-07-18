# `capture-mcp` Edge Function

The **insert-only capture door, spoken as MCP** (ADR-0014). The sibling of
[`capture-idea`](../capture-idea/README.md): the same narrow door, a different
protocol. Remote MCP connectors — **Perplexity** and **Claude** custom
connectors — speak the Model Context Protocol over **Streamable HTTP** and call a
single tool that lands a raw Idea in the `ideas` table via the `capture_idea`
Postgres RPC, spark stored verbatim.

## Endpoint

```
https://<project-ref>.supabase.co/functions/v1/capture-mcp
```

This one URL is the MCP endpoint (Streamable HTTP): `POST` for JSON-RPC calls,
`OPTIONS` for CORS preflight. `GET` returns `405` (this server pushes no
server-initiated messages, so there is no SSE stream to open).

## The tool

Exactly one tool is exposed:

- **`capture_idea`** — *File a raw content idea onto the Content OS pipeline; the
  spark is stored verbatim, no judgement.*

Input schema (JSON Schema):

```json
{
  "type": "object",
  "properties": {
    "spark":  { "type": "string", "description": "The raw idea text, stored verbatim as the idea body." },
    "title":  { "type": "string", "description": "Optional short readable summary of the idea." },
    "source": { "type": "string", "description": "Optional origin tag; defaults to \"app\"." }
  },
  "required": ["spark"],
  "additionalProperties": false
}
```

On `tools/call`, `spark` is forwarded verbatim as the RPC's `p_body`; a
missing/blank `spark` comes back as a tool error (`isError: true`). Success
returns a text content block naming the new idea id (e.g. `Captured idea
idea_…`) plus `structuredContent: { "id": "idea_…" }`. A DB/RPC failure is also a
tool error carrying the message.

The MCP surface implemented: `initialize`, the `notifications/initialized`
notification, `ping`, `tools/list`, and `tools/call`. The server is **stateless**
— it assigns no `Mcp-Session-Id`, so each request stands alone (a good fit for
the ephemeral edge runtime).

## Auth

Every request is authenticated against the **same `CAPTURE_TOKEN`** secret the
REST door uses — **no new secret**. The token may arrive on **either** header,
compared constant-time:

- **`x-api-key: <CAPTURE_TOKEN>`** — primary, because it is on Claude's
  request-header allowlist and is how Perplexity's API-Key auth is sent.
- **`Authorization: Bearer <CAPTURE_TOKEN>`** — fallback.

Missing/wrong token → `401`. Missing `CAPTURE_TOKEN` env var → `500`
(misconfiguration, never the caller's fault).

If not already set (the REST door shares it):

```sh
supabase secrets set CAPTURE_TOKEN="$(openssl rand -hex 32)"
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are auto-injected into Edge Functions —
you do not set those.

## Streamable HTTP: JSON vs SSE

The Streamable HTTP spec lets the server answer a request either as one JSON
object or as an SSE stream, and requires the client to support both. This
function negotiates on the `Accept` header:

- `Accept` includes **`text/event-stream`** → an **SSE** response (one `message`
  event per JSON-RPC response, then the stream ends). This is what Perplexity and
  Claude send, so connectors take the SSE path.
- otherwise (e.g. `Accept: application/json`) → a single **JSON** object.

Input that is solely notifications/responses gets `202 Accepted` with no body.

## Deploy

The function does its **own** auth, so Supabase's JWT gate must be off — exactly
like `capture-idea`. Either add a block to `supabase/config.toml`:

```toml
[functions.capture-mcp]
verify_jwt = false
```

**or** deploy with `--no-verify-jwt`:

```sh
supabase functions deploy capture-mcp --no-verify-jwt
```

One of the two is **required** — otherwise Supabase rejects the request before
our `x-api-key` / `Authorization` check ever runs.

## Add it in Perplexity

Settings → Connectors → **+ Custom connector**:

- **Type / Transport:** Remote, **Streamable HTTP**
- **URL:** `https://<project-ref>.supabase.co/functions/v1/capture-mcp`
- **Authentication:** **API Key** = your `CAPTURE_TOKEN` (sent as `x-api-key`)

Perplexity then lists the `capture_idea` tool and can file an Idea from a chat.

## Add it in Claude

Settings → Connectors → **Add custom connector**:

- **Remote MCP server URL:** `https://<project-ref>.supabase.co/functions/v1/capture-mcp`
- **Request headers:** add `x-api-key` = your `CAPTURE_TOKEN`

Header-based auth on custom connectors is currently a **Claude beta**; enable it
in the connector's advanced/beta settings if the request-headers field is not
shown by default.

## Try it (curl / JSON-RPC)

Ask for `application/json` to get a plain JSON response (omit it and connectors
would negotiate SSE). List the tools:

```sh
curl -s -X POST \
  "https://<project-ref>.supabase.co/functions/v1/capture-mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "x-api-key: $CAPTURE_TOKEN" \
  -d '{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }'
```

Call the tool (files an Idea):

```sh
curl -s -X POST \
  "https://<project-ref>.supabase.co/functions/v1/capture-mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "x-api-key: $CAPTURE_TOKEN" \
  -d '{
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
          "name": "capture_idea",
          "arguments": {
            "spark": "A post on why the capture door must be insert-only",
            "source": "app"
          }
        }
      }'
```

Expected: a result whose `content[0].text` is `Captured idea idea_…` and
`structuredContent.id` is the new id. `Authorization: Bearer $CAPTURE_TOKEN`
works in place of the `x-api-key` header.

## Least-privilege design

This door holds **only** the anon key plus the shared `CAPTURE_TOKEN` secret —
the **same door** as the REST `capture-idea` function, just a different protocol.
The `anon` role can `execute` exactly one thing — the `capture_idea`
`security definer` function — and has no table access (RLS is deny-by-default on
every base table). So even if the token leaks from a third-party (vendor-cloud)
connector, the worst it can do is insert one Idea; it can read, update, or delete
nothing. The Supabase **service key bypasses RLS and is NEVER referenced here** —
that would turn the narrow door into a master key. The trusted/local surface
(Claude Code, admin, `desk`) uses the official Supabase MCP server instead, never
this endpoint.
