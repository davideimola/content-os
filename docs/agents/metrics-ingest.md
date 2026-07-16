# metrics-ingest seam: raw exports to normalized metrics

`contentos metrics-ingest` turns the raw monthly inputs — a LinkedIn per-post export and
manually reported site numbers — into **normalized, versioned plain-text files** under the
repo's [Metrics snapshot](../../CONTEXT.md) area, `metrics/<YYYY-MM>/`. The monthly review
[Beat](../../CONTEXT.md) reads **only** this normalized form; the raw export never enters the
repo.

It is a subcommand of the `contentos` CLI (ADR-0003), and like the rest of the CLI it is
**hands, not brain**: the transform is deterministic and **idempotent** — re-running on the
same input produces byte-identical output — so month-over-month git diffs reflect real data
changes, not reformatting noise. The intelligence that turns a messy raw export into the input
contract lives in the review Beat (see [Producing the LinkedIn CSV](#producing-the-linkedin-csv-agent-skill)),
not in the CLI.

## Building the CLI

Same as the rest of `contentos` (see [notify.md](notify.md#building-the-cli)): `go install`
for other repos, `go run ./cmd/contentos` or `go build` from a checkout. No compiled binaries
are committed.

## The two input paths

```sh
# LinkedIn per-post export → metrics/2026-06/linkedin-posts.csv
contentos metrics-ingest linkedin --file 2026-06-linkedin.csv --month 2026-06

# manually reported site numbers → metrics/2026-06/site.csv
contentos metrics-ingest site --month 2026-06 --visitors 1234 --page-views 5678
```

Both write under `metrics/` in the current directory by default; override with `--metrics-dir`.
The review Beat runs from the content-os checkout, so the default is correct. On success each
prints a one-line confirmation to stdout; **exit status is the contract** — `0` written,
non-zero (with a reason on stderr) not, mirroring the [notify seam](notify.md).

## LinkedIn input contract (CSV)

A header row plus one row per post. Columns are matched **by header name in any order**, and
**extra columns are ignored** — so you can hand the tool a wider export without stripping it.

| column        | meaning                          | format                     |
| ------------- | -------------------------------- | -------------------------- |
| `date`        | the post's publish date          | `YYYY-MM-DD`               |
| `post_url`    | the post's permalink             | non-empty string           |
| `impressions` | impressions                      | non-negative integer       |
| `reactions`   | reactions                        | non-negative integer       |
| `comments`    | comments                         | non-negative integer       |
| `reshares`    | reshares                         | non-negative integer       |

All six are **required**; a missing column, a non-`YYYY-MM-DD` date, or a non-integer/negative
count is a named error and nothing is written. Example:

```csv
date,post_url,impressions,reactions,comments,reshares
2026-06-03,https://www.linkedin.com/feed/update/urn:li:activity:7200000000000000001,4210,88,12,5
2026-06-11,https://www.linkedin.com/feed/update/urn:li:activity:7200000000000000002,3110,54,7,2
```

## Site input (manual)

`--visitors` and `--page-views` are the two core [Vercel Analytics](../../CONTEXT.md) counts
Davide reports each month. At least one is required — the tool refuses to write an empty
`site.csv`.

```sh
contentos metrics-ingest site --month 2026-06 --visitors 1234 --page-views 5678
```

## Normalized output format

One directory per month, committed to git so history accumulates and trends become visible.

```
metrics/
  2026-06/
    linkedin-posts.csv   # one row per post
    site.csv             # one row per site metric
```

**`linkedin-posts.csv`** — the source facts only, canonicalized: fixed column order, rows
sorted by `date` then `post_url`, LF line endings. Derived measures (e.g. engagement rate) are
**not** stored — the review computes them from these facts, keeping the versioned data purely
factual.

```csv
date,post_url,impressions,reactions,comments,reshares
2026-06-03,https://www.linkedin.com/feed/update/urn:li:activity:7200000000000000001,4210,88,12,5
```

**`site.csv`** — a `metric,value` table, rows sorted by metric name for a stable diff.

```csv
metric,value
page_views,5678
visitors,1234
```

Both files are a **fixed point**: feeding one back through the tool yields itself. That, plus
the deterministic sort and formatting, is what makes re-runs idempotent and monthly diffs
meaningful.

## Producing the LinkedIn CSV (agent skill)

The CLI consumes the CSV contract above; getting there from LinkedIn's raw export is the review
Beat's job (hands vs. brain, ADR-0003). During the monthly review:

1. **Ask Davide for the raw LinkedIn analytics export** for the month — the XLSX from the
   creator analytics "Export" button, or the per-post numbers read straight off the LinkedIn
   UI. (Programmatic pull is not available to an individual without a legal entity — see
   [the LinkedIn analytics research](../research/linkedin-personal-analytics-api.md).)
2. **Map each post to a contract row**: publish `date`, `post_url` (the permalink),
   `impressions`, `reactions`, `comments`, `reshares`. Write the CSV to a **temporary file** —
   the raw export and this intermediate CSV are **never committed**; only the normalized output
   is.
3. **Run the ingest** against that temp file:
   `contentos metrics-ingest linkedin --file <tmp>.csv --month <YYYY-MM>`, and check the exit
   status.
4. **Ask Davide for the site numbers** from Vercel Analytics (visitors, page views for the
   month) and run `contentos metrics-ingest site --month <YYYY-MM> --visitors N --page-views N`.
5. **Commit** the resulting `metrics/<month>/` files.

Keeping this step in the Beat (not the CLI) is deliberate: the raw export shape drifts and is
messy; the CLI stays a dumb, testable normalizer, and the mapping judgement stays with the
agent.

## Testing

- **Automated (no network, no fixtures beyond the repo):** `go test ./internal/metrics/` (or
  the whole suite, `go test ./...`). The classic **golden-sample test** feeds a sample export
  with free column order, an extra ignored column, and unsorted rows, and asserts the exact
  normalized output — proving normalization does real work, not a passthrough. Further tests
  cover idempotency, the fixed-point property, the site path, and every named input error.
- The sample and its expected output live in `internal/metrics/testdata/`.
