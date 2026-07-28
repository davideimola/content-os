# metrics ingest: raw exports into the Pipeline

Metrics ingest turns the monthly raw inputs — LinkedIn's creator **Aggregate Analytics** export and the
manually reported site numbers — into rows in the Supabase [Metrics snapshot](../../CONTEXT.md) tables
(`metrics_linkedin_posts` / `metrics_linkedin_account` / `metrics_linkedin_followers` / `metrics_site`).
It is four tools on the **content-os MCP adapter**
([ADR-0015](../adr/0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md)):

- **`ingest_linkedin_metrics(month, csv_text)`** — the adapter parses the per-post CSV deterministically
  (server-side) and **replaces that month's posts** in one atomic write.
- **`record_linkedin_account(month, impressions?, members_reached?, new_followers?)`** — upserts the
  month's LinkedIn **account-level** snapshot: the figures that are **quantities of the month**.
- **`record_linkedin_followers(observed_on, total)`** — records the follower **level** against the date it
  was observed (upsert on that date). The level is **not** a monthly quantity, so it never sits on a month
  row (see [below](#the-follower-level-is-keyed-by-its-observation-date)).
- **`record_site_metrics(month, visitors?, page_views?)`** — upserts the month's **website** numbers.

This replaces the retired `contentos metrics-ingest` Go CLI (ADR-0009 → ADR-0015). The parse is still
deterministic and idempotent — re-ingesting a corrected export just replaces the month — and the numbers
live in the DB, not in committed `metrics/<YYYY-MM>/` files.

The contract follows **what LinkedIn actually exports to a private individual**
([ADR-0019](../adr/0019-linkedin-metrics-contract-follows-the-aggregate-export.md)): programmatic pull is
gated behind a legal entity (see [the research](../research/linkedin-personal-analytics-api.md)), so the
only self-serve source is the creator Aggregate Analytics XLSX. That export gives, **per post**, only
`impressions` and a single **combined `engagements`** — never a reaction/comment/reshare split — and its
figures are **per-period** (a post's per-post impressions sum to the month's account total), not lifetime.
Turning that messy multi-sheet XLSX into the input contract is the monthly [Review](../../CONTEXT.md)'s job
(judgement, not a deterministic transform — see [Producing the inputs](#producing-the-inputs-from-the-export)).

## LinkedIn per-post contract (CSV)

A header row plus one row per post. Columns are matched **by header name in any order**, and **extra
columns are ignored** — so a wider CSV is fine.

| column        | meaning                 | format                 |
| ------------- | ----------------------- | ---------------------- |
| `date`        | the post's publish date | `YYYY-MM-DD`           |
| `post_url`    | the post's permalink    | non-empty string       |
| `impressions` | impressions in the month| non-negative integer   |
| `engagements` | combined engagements    | non-negative integer   |

All four are **required**; a missing column, a non-`YYYY-MM-DD` date, or a non-integer/negative count is a
named tool error and nothing is written. Because the numbers are per-period, a post that stayed active over
several months appears in several monthly ingests; its lifetime total is the **sum** across months, and the
Piece it belongs to is linked by `pieces.linkedin_post_url` (matched on `post_url`, which rolls up every
slice). Example:

```csv
date,post_url,impressions,engagements
2026-06-16,https://www.linkedin.com/posts/davideimola_..._share-7472570052525854722-tDjU,146,4
2026-05-21,https://www.linkedin.com/posts/davideimola_..._share-7463159988035715072-TU_Y,196,5
```

## LinkedIn account-level input

`record_linkedin_account` takes the month's `impressions`, `members_reached`, and `new_followers` (the
month's follower growth). All optional; whatever is provided is upserted on the month. Every one of them is
a **quantity of the period**, and the period is the row's key.

## The follower level is keyed by its observation date

The export reports the follower **total at export time**, and the export always arrives **after** the month
has ended — so a level can never sit honestly on a month row (June's row once carried a 22 July figure).
`record_linkedin_followers(observed_on, total)` records it against the date it was actually read, which is
the date the number is true for: the key cannot lie, and the observations accrue a real level series, one
point per ingest.

| argument      | meaning                                     | format               |
| ------------- | ------------------------------------------- | -------------------- |
| `observed_on` | the day the level was read (the export date)| `YYYY-MM-DD`, required |
| `total`       | the follower total on that date             | non-negative integer, required |

**Never pass a month boundary** as the observation date to make it look tidy — pass the day you read it.
The tool refuses a call with no observation date (it is not defaulted to today), and re-recording the same
date **replaces** it, so a corrected read of the same day lands as a correction rather than a second truth.
`record_linkedin_account` **refuses** a `followers_total` argument outright, so a stale caller fails loudly
instead of having the level silently dropped.

The month's **growth** (`new_followers`) stays on the month row and is the exact monthly follower metric —
verified window-independent — which is why the console's follower curve is **cumulative growth**, with the
level shown separately beside the date it was observed.

## Site input (manual)

`visitors` and `page_views` are the two core site counts Davide reports each month (the **website**,
distinct from LinkedIn), read **by hand from the Umami Cloud dashboard** — the free plan has no API, so
there is no programmatic pull (the site ran on Vercel Analytics until mid-July 2026). At least one is
required. `record_site_metrics` upserts on the month, so re-recording corrects it.

## Producing the inputs from the export

The tools consume the contract above; getting there from LinkedIn's raw **Aggregate Analytics** XLSX is the
monthly Review's job. The export has five sheets; the map:

- **DISCOVERY** → the month's account `impressions` and `members_reached`.
- **TOP POSTS** → two side-by-side ranked lists (posts by impressions, posts by engagements). Join them by
  `post_url` to get, per post: `post_url`, publish `date`, `impressions`, `engagements` (0 when absent from
  the engagements list). At personal volume the lists are complete (per-post impressions sum to DISCOVERY).
- **FOLLOWERS** → `new_followers` (sum of the daily "New followers") for the month row, and the follower
  **total** for `record_linkedin_followers` — keyed by the **export date**, which is the day that total was
  true, never by the month.
- ENGAGEMENT (daily account series) and DEMOGRAPHICS are not ingested.

During the Review (steps in [monthly-beat.md](monthly-beat.md)):

1. **Ask Davide for the Aggregate Analytics XLSX** for the month + the site numbers (read by hand from the
   Umami Cloud dashboard).
2. **Read the XLSX** (an XLSX is a zip of XML — unzip and read the sheets) and build the per-post CSV
   (`date, post_url, impressions, engagements`) + the account figures + the follower total with **the date
   the export was taken**.
3. **Call** `ingest_linkedin_metrics(month, csv_text)`, `record_linkedin_account(month, …)`,
   `record_linkedin_followers(observed_on, total)`, and `record_site_metrics(month, …)`.

Nothing is committed — the numbers live in the Pipeline.

## Verify

No unit tests — verified at the ops seam against a local Supabase: ingest a small sample CSV (columns in any
order, an extra ignored column) and assert the rows land, that a re-ingest **replaces** (not duplicates) the
month, that `record_linkedin_account` upserts, and that the bad-date / missing-column / negative-count paths
come back as tool errors. For the level: `record_linkedin_followers` **raises with no observation date**,
and re-recording the same date replaces rather than duplicating. `get_metrics(month)` returns the per-post
rows, the account snapshot, the site numbers, and the latest follower level with its observation date (that
one is not a figure of the queried month).
