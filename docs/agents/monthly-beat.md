# The Review's procedure: metrics ritual, mix & Cadence over Pieces

This is the procedure the **[Review](../../CONTEXT.md)** (`/review`) runs — the monthly sibling of the
[Desk](../../CONTEXT.md): the live session where Davide turns a month of output into next month's steer.
`/review` reads this doc and runs its steps **with Davide in the loop**, never autonomously — the
monthly [Beat](../../CONTEXT.md) only *reminds* him to open it (detect → ping, ADR-0013). Like the Desk,
the Review **judges and reports; it never drafts content** (ADR-0002).

The Review is **semi-interactive by nature**: an individual can't pull personal LinkedIn analytics
programmatically without a legal entity (see [the research](../research/linkedin-personal-analytics-api.md)),
so the ritual **asks Davide** for the month's export and site numbers, then does the rest. The
deterministic normalization is **hands, not brain** (ADR-0003) — [`contentos metrics-ingest`](metrics-ingest.md);
the judgement (what the numbers mean, where to point next) is the Review.

## Before you start

- Run from a `content-os` checkout, with `gh` authenticated (the `repo` **and** `project` scopes — the
  Calendar lives under `gh project`, see [calendar.md](calendar.md)).
- `contentos` on PATH (`make install-bin`, default `~/.local/bin`) or run it from source
  (`go run ./cmd/contentos …`); `jq` available for the JSON reads.

## What it runs against

- **Reads:** the normalized [metrics](metrics-ingest.md) under `metrics/<YYYY-MM>/`, the month's
  **published Pieces** (their Flag/Side and channel labels and dates), and the CFP horizon (the
  `Talks & CFP` view).
- **Writes:** the normalized metrics files (via `metrics-ingest`, committed to the repo), and — only if
  Davide asks — one digest [ping](notify.md). The Review asks Davide for the raw inputs; it never
  invents them.

## The procedure

**1 — Open the ritual (ask for the inputs).** Ask Davide for the month's raw inputs: the **LinkedIn
analytics export** (the creator-analytics XLSX, or the per-post numbers read off the LinkedIn UI) and
the **site numbers** from Vercel Analytics (visitors, page views). The fixed monthly ritual is what
makes data collection reliable — it never depends on memory.

**2 — Ingest (hands, not brain).** Map the raw export to the CSV contract and normalize it — the mapping
judgement is the Review's, kept out of the CLI (see
[Producing the LinkedIn CSV](metrics-ingest.md#producing-the-linkedin-csv-agent-skill)):

```sh
contentos metrics-ingest linkedin --file <tmp-export>.csv --month <YYYY-MM>
contentos metrics-ingest site --month <YYYY-MM> --visitors <N> --page-views <N>
```

Then **commit** `metrics/<YYYY-MM>/` so history accumulates.

**3 — Cross the metrics with the Calendar.** Pull the month's shipped **Pieces** and join "what
published" with "how it performed":

```sh
# the month's published Pieces, with their Flag/Side + channel
gh issue list --repo davideimola/content-os --state all --label published \
  --json number,title,labels,closedAt
```

Read `metrics/<YYYY-MM>/linkedin-posts.csv` for the LinkedIn performance and `site.csv` for the
site — then attribute performance to the published set (top performer, laggard, blog traffic).

**4 — Report against the targets — counted over Pieces.** The mix and Cadence are measured over
**Pieces, never Ideas** ([pipeline-taxonomy.md](pipeline-taxonomy.md#cadence-is-counted-over-pieces)):

- **Mix:** the realized **Flag/Side** split (count `flag` vs `side` among the month's published Pieces)
  against the **~70% Flag** target.
- **Cadence:** `linkedin` Pieces this month against the weekly **floor** (≈ 4/month), `blog` Pieces
  against **1/month**. State the floor **met** or **missed** — a floor, never a ceiling.

**5 — Check the horizon.** Is **next month's blog slot** filled (a `blog` Piece `slotted`/`proposed`
for next month)? Any **CFP deadlines** approaching in the `Talks & CFP` view? Name them so the report
ends forward-looking.

**6 — Report to Davide (recommendations cite the numbers).** Present the month live in the session: the
month in numbers, mix and Cadence vs targets, the horizon, and **grounded recommendations that cite the
numbers behind them**:

```
June review 📊
LinkedIn: 4 posts · 12,400 impressions · top: <thesis> (4,210). Site: 1,850 visitors.
Mix: 67% Flag (target ~70%) · Cadence: LinkedIn floor met (4 Pieces), blog met (1 Piece).
Next: July blog slot empty ⚠️ · CFP <event> closes <date>.
→ Double down: your Flag Piece (<thesis>, 4,210) beat the Side one (1,100) ~3.8× — lean Flag.
→ Fill July's blog slot this week.
```

Every "double down on X / drop Y" carries the figure behind it — the review ends on evidence, not a
feeling. Davide is in the room, so this is a live report; **send it as a ping only if he asks**:

```sh
source scripts/beats/lib.sh
notify_ping "<the report above>"
```

## The report shape

Lead with the month in numbers, then targets (mix and Cadence, both **over Pieces**), then the horizon,
then recommendations — each naming the number that justifies it. Keep it scannable (see the
[ping format](notify.md#ping-format)); direct links to the Pieces or the board view so a recommendation
is one tap from acting.

## Verification (tracker seam, fixture data)

No unit tests — the Review is a prompt, driven and observed (the spec's Testing Decisions). Verify with
**fixture data**:

1. Ingest a fixture LinkedIn export + site numbers into a **throwaway** month (use
   `metrics-ingest --metrics-dir <tmp>` so the repo's `metrics/` is untouched), and seed a few
   `published` **Pieces** for that month with Flag/Side + channel labels.
2. Run steps 3–6; confirm the report **crosses** the metrics with the Calendar, reports the **mix and
   Cadence over Pieces** against their targets, and every **recommendation cites a number**.
3. Clean up the seed and the throwaway metrics dir.

Verified **2026-07-18** with fixture data: a fixture LinkedIn export (3 posts of raw performance data) +
site numbers ingested to a throwaway metrics dir (repo `metrics/` untouched), and three `published`
Pieces seeded for June (2 Flag / 1 Side; 2 `linkedin` + 1 `blog`). The report **crossed** the posts'
performance with the June published Pieces — **mix and Cadence count Pieces, performance reads the
posts** — reporting the **mix over Pieces** (67% Flag vs ~70%) and **Cadence over Pieces** (2 `linkedin`
Pieces/mo, under the ≈ 4 floor; 1 `blog` Piece, met), with every recommendation **citing its figure**
(the top post's 6,050 impressions beat the laggard's 3,110 ~1.9×). Seed and temp dir cleaned up.
