# Content OS — Supabase setup & operations

The runbook for the Supabase backend that is now the Pipeline's source of truth (ADR-0014). It is the
*how to run it* companion to [`docs/design/supabase-foundations.md`](design/supabase-foundations.md)
(*what it is*: schema, RPC contract, views).

Project ref: `<project-ref>` — the identifier in your Supabase project URL (region EU · Frankfurt).
Function base URL: `https://<project-ref>.supabase.co/functions/v1/`.

---

## 1. Prerequisites

- **Supabase CLI** — pinned in `mise.toml`; `mise install` provides it (`supabase --version`).
- **A Supabase project** — created from the dashboard (region EU/Frankfurt), with a saved DB password.
- **`gh` CLI** — authenticated, for setting the GitHub Actions secrets.

## 2. Link the repo to the project

Done once per machine:

```sh
supabase login                              # interactive, browser token
supabase init                               # creates supabase/config.toml (already committed)
supabase link --project-ref <project-ref>          # asks for the DB password
```

The linked project ref is stored in `supabase/.temp/` (gitignored). `config.toml` is committed.

## 3. Secrets — three separate stores

Do **not** mix them up: a value in one store is not visible to the others.

| Secret | Store | Used by |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | **GitHub repo secrets** | the migrations CI |
| `SUPABASE_DB_PASSWORD` | **GitHub repo secrets** | the migrations CI |
| `SUPABASE_PROJECT_ID` | **GitHub repo secrets** | the migrations CI |
| `CAPTURE_TOKEN` | **Supabase secrets** | the capture Edge Functions (runtime) |
| any of the above, for local convenience | **`.env`** (gitignored) | your terminal |

- GitHub secrets: *repo → Settings → Secrets and variables → Actions*, or `gh secret set NAME`.
- `SUPABASE_ACCESS_TOKEN` comes from *supabase.com → Account → Access Tokens*.
- **`CAPTURE_TOKEN`** you invent — a strong random string, e.g. `openssl rand -hex 32`. Set it with
  `supabase secrets set CAPTURE_TOKEN=<value>`. **Supabase secrets are write-only** — you cannot read it
  back, so save a copy (password manager); you reuse the same value in the AI-app connectors.

## 4. Migrations

Plain SQL files in `supabase/migrations/<timestamp>_*.sql`, applied in order and tracked in
`supabase_migrations.schema_migrations`.

```sh
supabase migration new <name>     # scaffold a new migration
supabase db push                  # apply pending migrations to the linked project
```

**CI auto-applies on merge.** `.github/workflows/supabase.yml` runs `supabase db push` **then**
`supabase functions deploy` (in that order) whenever a push to `main` touches `supabase/**`. Migrations
before functions, so a function that calls a new RPC never ships ahead of the migration that creates it.
Both are idempotent, and it uses the same CLI path as a local run, so the tracked files stay the single
owner of the schema + functions. Manual run: *Actions → Content OS — Supabase deploy → Run workflow*.

## 5. Capture doors

Two Edge Functions, both authenticating with the **same `CAPTURE_TOKEN`** and both declared
`verify_jwt = false` in `config.toml` (custom auth replaces the JWT gate) — but with **different powers**
since ADR-0015:

| Function | Protocol | Powers | For |
| --- | --- | --- | --- |
| `capture-idea` | plain REST (POST JSON) | **insert-only**: `anon` key, only the `capture_idea` RPC — a leaked token inserts one Idea, nothing more | ChatGPT Custom GPT Action, curl, any HTTP client |
| `capture-mcp` | MCP over Streamable HTTP | the **content-os operations adapter**: `service_role` (SELECT-only grants + the privileged verbs), reads + write verbs, `capture_idea` among them | the skills + Perplexity/Claude connectors |

Deploy — **CI does this on push** (`supabase.yml`, after migrations). To deploy by hand
(config.toml carries `verify_jwt=false`, so no flag needed):

```sh
supabase functions deploy            # both functions; or pass one name
```

Smoke tests (run in your own terminal; keep the token out of the transcript):

```sh
export CT='<CAPTURE_TOKEN>'
BASE="https://<project-ref>.supabase.co/functions/v1"

# REST — expect 200 { ok:true, id:"idea_..." }
curl -s -X POST "$BASE/capture-idea" \
  -H "content-type: application/json" -H "x-capture-token: $CT" \
  -d '{"spark":"test","source":"curl"}'

# MCP — expect a result with id:"idea_..."
curl -s -X POST "$BASE/capture-mcp" \
  -H "content-type: application/json" -H "accept: application/json" -H "x-api-key: $CT" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"capture_idea","arguments":{"spark":"test mcp","source":"curl-mcp"}}}'

# Negative — no/wrong token must be 401 on both
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/capture-mcp" -H "content-type: application/json"
```

Note the auth header differs by door: the REST door reads `x-capture-token`; the MCP door reads
`x-api-key` (or `Authorization: Bearer`), because `x-api-key` is on Claude's request-header allowlist.

## 6. Connect the AI apps

Same `CAPTURE_TOKEN` everywhere.

- **Perplexity** (Pro/Max) → *+ Custom connector → Remote*: URL `…/functions/v1/capture-mcp`,
  Transport **Streamable HTTP**, Authentication **API Key** = `CAPTURE_TOKEN`.
- **Claude** (any plan) → *Add custom connector → Request headers*: header **`x-api-key`** = `CAPTURE_TOKEN`.
  (Request-header auth is a Claude beta — if the field is absent, request early access; Perplexity works
  meanwhile.)
- **ChatGPT** → a **Custom GPT Action** whose OpenAPI operation POSTs to `…/functions/v1/capture-idea`
  with `x-capture-token` as the API key. (ChatGPT's *MCP* connectors run write tools only on
  Business/Enterprise; on Plus/Pro use the REST Action, which has no such gate.)

Once connected, dictate or type a spark in the app → it lands as a `live` Idea in the pool.

## 7. Operations

- **View data** — dashboard *Table editor* (`ideas`, `pieces`, `talks`, `engagements`, `events`,
  `metrics_*`), or the views (`public_events`, `untriaged_proposals`, `cadence_status`, `flag_mix`).
- **Rotate `CAPTURE_TOKEN`** — `supabase secrets set CAPTURE_TOKEN=<new>` (function restarts in seconds),
  then update the value in every connector. Rotate if it ever leaks.
- **Public read for davideimola.dev** — the site reads only the `public_events` view via the `anon`
  role; base tables stay behind RLS (deny-by-default). `service_role` (CLI/skills) bypasses RLS.

## 8. Troubleshooting

- **`function gen_random_bytes(...) does not exist`** — on Supabase `pgcrypto` lives in the `extensions`
  schema, off the migration search_path. IDs use core `gen_random_uuid()` instead (fixed in the init
  migration); don't reintroduce `gen_random_bytes`.
- **CI "Node.js 20 is deprecated" annotation** — benign; `actions/checkout` and `supabase/setup-cli` are
  forced to Node 24. Ignore, or bump the action versions later.
- **MCP connector returns 401** — the app is sending the wrong header/value. The MCP door wants
  `x-api-key` (or `Authorization: Bearer`); confirm the connector's auth field holds the exact
  `CAPTURE_TOKEN`.
- **`db push` prompts / fails in CI** — check the three GitHub secrets; the run links then pushes and
  should report *"Remote database is up to date"* when there's nothing pending.
