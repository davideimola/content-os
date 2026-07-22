# The Review's procedure: metrics ritual, mix & Cadence over Pieces

This is the procedure the **[Review](../../CONTEXT.md)** (`/review`) runs — the monthly sibling of the
[Desk](../../CONTEXT.md): the live session where Davide turns a month of output into next month's steer.
`/review` reads this doc and runs its steps **with Davide in the loop**, never autonomously — the
monthly [Beat](../../CONTEXT.md) only *reminds* him to open it (detect → ping, ADR-0013). Like the Desk,
the Review **judges and reports; it never drafts content** (ADR-0002). The metrics now live in the
Supabase Pipeline and are ingested through the **content-os MCP tools** (ADR-0014/0015), not committed
files.

The Review is **semi-interactive by nature**: an individual can't pull personal LinkedIn analytics
programmatically without a legal entity (see [the research](../research/linkedin-personal-analytics-api.md)),
so the ritual **asks Davide** for the month's export and site numbers, then does the rest. The
deterministic parse is server-side (in the MCP adapter); the judgement (what the numbers mean, where to
point next) is the Review.

## Before you start

- Run from a `content-os` checkout, with the **`content-os-capture` MCP server** available (its tools —
  `ingest_linkedin_metrics`, `record_linkedin_account`, `record_site_metrics`, `get_metrics`,
  `list_calendar`, `flag_mix`, `cadence_status` — are present).
- **You are the brain**, with Davide reading the numbers alongside you — never an autonomous model.

## What it runs against

- **Reads (MCP tools):** `get_metrics(month)` (the month's LinkedIn posts + site), `list_calendar` (the
  month's shipped **Pieces** with Flag/Side + channel + date), and `flag_mix` / `cadence_status` for a
  current snapshot. The realized figures for the reviewed month are **computed over that month's
  published Pieces**, not read from the lifetime `flag_mix` view.
- **Writes (MCP tools):** `ingest_linkedin_metrics` + `record_linkedin_account` + `record_site_metrics`
  land the month's numbers in the DB (idempotent — re-running replaces the month). Only if Davide asks, one
  digest [ping](notify.md). The Review asks Davide for the raw inputs; it never invents them.

## The procedure

**1 — Open the ritual (ask for the inputs).** Ask Davide for the month's raw inputs: the **LinkedIn
creator Aggregate Analytics export** (the `AggregateAnalytics_…_<month>.xlsx`) and the **site numbers**
(visitors, page views) read by hand from the Umami Cloud dashboard (free plan → no API; the site ran on
Vercel Analytics until mid-July 2026). The fixed monthly ritual is what makes data collection reliable —
it never depends on memory.

**2 — Ingest.** Read the XLSX (it's a zip of XML — unzip and read the sheets) and derive the inputs per the
[sheet map](metrics-ingest.md#producing-the-inputs-from-the-export): the per-post CSV
`date, post_url, impressions, engagements` (join TOP POSTS' two lists by `post_url`), the account figures
(DISCOVERY + FOLLOWERS), and the site numbers. Then call the tools (the deterministic parse + atomic write
is server-side):

- `ingest_linkedin_metrics(month = <YYYY-MM>, csv_text = <the per-post CSV>)`
- `record_linkedin_account(month = <YYYY-MM>, impressions = <N>, members_reached = <N>, followers_total = <N>, new_followers = <N>)`
- `record_site_metrics(month = <YYYY-MM>, visitors = <N>, page_views = <N>)`

The per-post figures are **per-period** (a post's impressions sum to the month total), not lifetime — a
still-active post recurs in later months. No files are committed — the numbers live in the DB, so
re-ingesting a corrected export just replaces the month.

**3 — Cross the metrics with the Calendar.** Read the month's shipped **Pieces** and join "what
published" with "how it performed":

- `list_calendar` → filter to the reviewed month's `published` Pieces (their Flag/Side + channel).
- `get_metrics(month)` → the LinkedIn per-post performance + the site numbers.

Attribute performance to the published set (top performer, laggard, blog traffic).

**4 — Report against the targets — counted over Pieces.** The mix and Cadence are measured over
**Pieces, never Ideas** ([pipeline-taxonomy.md](pipeline-taxonomy.md#cadence-is-counted-over-pieces)),
**computed over the reviewed month's published Pieces** (from step 3):

- **Mix:** the realized **Flag/Side** split (count `flag` vs `side` among the month's published Pieces)
  against the **~70% Flag** target.
- **Cadence:** `linkedin` Pieces this month against the weekly **floor** (≈ 4/month), `blog` Pieces
  against **1/month**. State the floor **met** or **missed** — a floor, never a ceiling.

**5 — Check the horizon.** Is **next month's blog slot** filled (a `blog` Piece `slotted`/`proposed` for
next month — from `list_calendar`)? Any **CFP deadlines** approaching? (The Engagement/CFP tier is not
yet on the adapter — check it manually for now.) Name them so the report ends forward-looking.

**6 — Report to Davide (recommendations cite the numbers).** Present the month live in the session: the
month in numbers, mix and Cadence vs targets, the horizon, and **grounded recommendations that cite the
numbers behind them**:

```
June review 📊
LinkedIn: 4 posts · 12,400 impressions · 210 engagements · +46 followers (2,839). Site: 1,850 visitors.
Mix: 67% Flag (target ~70%) · Cadence: LinkedIn floor met (4 Pieces), blog met (1 Piece).
Next: July blog slot empty ⚠️ · CFP <event> closes <date>.
→ Double down: your Flag Piece (<thesis>, 4,210) beat the Side one (1,100) ~3.8× — lean Flag.
→ Fill July's blog slot this week.
```

Every "double down on X / drop Y" carries the figure behind it — the review ends on evidence, not a
feeling. Davide is in the room, so this is a live report; **send it as a ping only if he asks**
(`notify_ping` in `scripts/beats/lib.sh`).

## The report shape

Lead with the month in numbers, then targets (mix and Cadence, both **over Pieces**), then the horizon,
then recommendations — each naming the number that justifies it. Keep it scannable (see the
[ping format](notify.md#ping-format)).

## Verification (ops seam, fixture data)

No unit tests — the Review is a prompt, driven and observed. Verify with **fixture data** against a local
Supabase:

1. `ingest_linkedin_metrics` a fixture export + `record_site_metrics` for a throwaway month, and seed a
   few `published` **Pieces** for that month (Flag/Side + channel + a publish_date in the month).
2. Run steps 3–6; confirm the report **crosses** the metrics with the Calendar, reports the **mix and
   Cadence over Pieces** against their targets, and every **recommendation cites a number**.
3. Clean up the seed rows and the throwaway month.
