# `capture-idea` Edge Function

The **insert-only phone door** onto the Pipeline (ADR-0014). Phone AI apps — a
ChatGPT Custom GPT Action, an MCP connector — `POST` a raw Idea here and it lands
in the `ideas` table via the `capture_idea` Postgres RPC, spark stored verbatim.

## Contract

`POST` with a JSON body:

```json
{ "spark": "the raw idea text", "title": "optional short summary", "source": "app" }
```

- `spark` (**required**) — the raw idea text, passed verbatim as the RPC's
  `p_body`. An empty/blank `spark` is rejected with `400`.
- `title` (optional) — a short readable summary; `null` when omitted.
- `source` (optional) — defaults to `app`.

Auth is a shared secret in the **`x-capture-token`** header (see below); a
missing/wrong token is `401`.

Responses:

- `200 → { "ok": true, "id": "idea_…" }`
- `4xx/5xx → { "ok": false, "error": "…" }` (400 bad body, 401 unauthorized,
  405 wrong method, 5xx server/DB error)

## Set the secret

The function authenticates callers against `CAPTURE_TOKEN`. Generate a long
random value and set it as a Function secret (never commit it):

```sh
supabase secrets set CAPTURE_TOKEN="$(openssl rand -hex 32)"
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are auto-injected into Edge Functions —
you do not set those.

## Deploy

The function does its **own** auth, so Supabase's JWT gate must be off. Either
deploy with `--no-verify-jwt`:

```sh
supabase functions deploy capture-idea --no-verify-jwt
```

**or** add a block to `supabase/config.toml` (created by `supabase init`):

```toml
[functions.capture-idea]
verify_jwt = false
```

One of the two is **required** — otherwise Supabase rejects the request before
our `x-capture-token` check ever runs.

## Try it

```sh
curl -i -X POST \
  "https://<project-ref>.supabase.co/functions/v1/capture-idea" \
  -H "Content-Type: application/json" \
  -H "x-capture-token: $CAPTURE_TOKEN" \
  -d '{ "spark": "A post on why the capture door must be insert-only", "source": "app" }'
```

Expected: `200` with `{ "ok": true, "id": "idea_…" }`.

## Least-privilege design

This door holds **only** the anon key plus the `CAPTURE_TOKEN` secret. The anon
role can `execute` exactly one thing — the `capture_idea` `security definer`
function — and has no table access (RLS is deny-by-default on every base table).
So even if the token leaks from a third-party cloud, the worst it can do is
insert one Idea; it can read, update, or delete nothing. The Supabase
**service key bypasses RLS and must NEVER be used here** — that would turn the
narrow door into a master key. The trusted/local surface (Claude Code, admin,
`desk`) uses the official Supabase MCP server instead, never this endpoint.

## ChatGPT Custom GPT Action

Point a Custom GPT Action's OpenAPI operation at
`POST https://<project-ref>.supabase.co/functions/v1/capture-idea` with the
request body above. Configure the Action's authentication as an **API Key** in a
**custom header named `x-capture-token`**, whose value is the `CAPTURE_TOKEN`
you set. The GPT then files an Idea per user turn. (MCP connectors call the same
endpoint with the same header.)
