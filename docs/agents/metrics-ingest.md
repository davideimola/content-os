# metrics ingest: raw exports into the Pipeline

Metrics ingest turns the raw monthly inputs — a LinkedIn per-post export and manually reported site
numbers — into rows in the Supabase [Metrics snapshot](../../CONTEXT.md) tables (`metrics_linkedin_posts`
/ `metrics_site`). It is two tools on the **content-os MCP adapter**
([ADR-0015](../adr/0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md)):

- **`ingest_linkedin_metrics(month, csv_text)`** — the adapter parses the export CSV deterministically
  (server-side) and **replaces that month's posts** in one atomic write.
- **`record_site_metrics(month, visitors?, page_views?)`** — upserts the month's site numbers.

This **replaces the retired `contentos metrics-ingest` Go CLI** (ADR-0009 → ADR-0015). The parse is still
deterministic and idempotent — re-ingesting a corrected export just replaces the month — but the output
now lives in the DB, not in committed `metrics/<YYYY-MM>/` files, so the old git-diff-stability argument
no longer applies. The intelligence that turns a messy raw export into the input contract stays with the
monthly [Review](../../CONTEXT.md) (see [Producing the LinkedIn CSV](#producing-the-linkedin-csv)).

## LinkedIn input contract (CSV)

A header row plus one row per post. Columns are matched **by header name in any order**, and **extra
columns are ignored** — so you can hand the tool a wider export without stripping it.

| column        | meaning                 | format                 |
| ------------- | ----------------------- | ---------------------- |
| `date`        | the post's publish date | `YYYY-MM-DD`           |
| `post_url`    | the post's permalink    | non-empty string       |
| `impressions` | impressions             | non-negative integer   |
| `reactions`   | reactions               | non-negative integer   |
| `comments`    | comments                | non-negative integer   |
| `reshares`    | reshares                | non-negative integer   |

All six are **required**; a missing column, a non-`YYYY-MM-DD` date, or a non-integer/negative count is a
named tool error and nothing is written. `reshares` maps to the DB column `shares`; `clicks`/`piece_id`
are not in the export (left null; a post is linked to its Piece later). Example:

```csv
date,post_url,impressions,reactions,comments,reshares
2026-06-03,https://www.linkedin.com/feed/update/urn:li:activity:7200000000000000001,4210,88,12,5
2026-06-11,https://www.linkedin.com/feed/update/urn:li:activity:7200000000000000002,3110,54,7,2
```

## Site input (manual)

`visitors` and `page_views` are the two core [Vercel Analytics](../../CONTEXT.md) counts Davide reports
each month. At least one is required. `record_site_metrics` upserts on the month, so re-recording
corrects it.

## Producing the LinkedIn CSV

The `ingest_linkedin_metrics` tool consumes the CSV contract above; getting there from LinkedIn's raw
export is the monthly Review's job (judgement, not a deterministic transform). During the Review:

1. **Ask Davide for the raw LinkedIn analytics export** for the month — the XLSX from the creator
   analytics "Export" button, or the per-post numbers read off the LinkedIn UI. (Programmatic pull is not
   available to an individual without a legal entity — see
   [the LinkedIn analytics research](../research/linkedin-personal-analytics-api.md).)
2. **Map each post to a contract row**: `date`, `post_url`, `impressions`, `reactions`, `comments`,
   `reshares` — as CSV text.
3. **Call** `ingest_linkedin_metrics(month = <YYYY-MM>, csv_text = <the CSV>)`.
4. **Ask Davide for the site numbers** (visitors, page views) and call
   `record_site_metrics(month = <YYYY-MM>, visitors = N, page_views = N)`.

Nothing is committed — the numbers live in the Pipeline.

## Verify

No unit tests — verified at the ops seam against a local Supabase: ingest a small sample export CSV
(columns in any order, an extra ignored column, unsorted rows) and assert the rows land with
`reshares → shares`, that a re-ingest replaces (not duplicates) the month, and that the bad-month /
missing-column / missing-numbers paths come back as tool errors.
