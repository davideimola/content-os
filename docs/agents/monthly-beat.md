# Monthly review Beat: metrics ritual, mix check, digest

The third [Beat](../../CONTEXT.md) — a monthly session that turns a month of output into next month's
steer. It guides the [Metrics snapshot](../../CONTEXT.md) ritual, crosses the numbers with the
[Calendar](../../CONTEXT.md), reports the realized **Flag/Side mix** against the ~70% target and the
**[Cadence](../../CONTEXT.md)** against its floor, checks next month's blog slot and the CFP horizon,
and pings a digest whose recommendations **cite the numbers behind them** (user stories 15–19).

Unlike the [Monday](monday-beat.md) and [Thursday](thursday-beat.md) guards, this Beat is
**semi-interactive by nature**: an individual can't pull personal LinkedIn analytics programmatically
without a legal entity (see [the research](../research/linkedin-personal-analytics-api.md)), so the ritual **asks Davide**
for the month's export and site numbers, then does the rest. Still **hands, not brain** (ADR-0003):
the deterministic normalization is [`contentos metrics-ingest`](metrics-ingest.md); the judgement —
what the numbers mean, where to point next — is this prompt. It **never drafts content** (ADR-0002).

## What it runs against

- **Reads:** the normalized [metrics](metrics-ingest.md) under `metrics/<YYYY-MM>/`, the Calendar's
  `published` pieces for the month (with their Flag/Side and channel labels and dates), and the CFP
  horizon (the `Talks & CFP` view).
- **Writes:** the normalized metrics files (via `metrics-ingest`, committed to the repo), and one
  digest [ping](notify.md). It asks Davide for the raw inputs — it does not invent them.

Preconditions and the trigger mechanism are shared with the other Beats — see
[monday-beat.md](monday-beat.md#preconditions) and [Scheduling](monday-beat.md#scheduling-ac4). The
Beat is **trigger-agnostic** (ADR-0003).

## The procedure

**1 — Open the ritual (ask for the inputs, user story 15).** Ping Davide to start the review and
request the month's raw inputs: the **LinkedIn analytics export** (the creator-analytics XLSX, or the
per-post numbers) and the **site numbers** from Vercel Analytics (visitors, page views). The fixed
monthly trigger is what makes data collection reliable — it never depends on memory.

**2 — Ingest (hands, not brain).** Map the raw export to the CSV contract and normalize it — this is
the review Beat's job, kept out of the CLI (see
[Producing the LinkedIn CSV](metrics-ingest.md#producing-the-linkedin-csv-agent-skill)):

```sh
contentos metrics-ingest linkedin --file <tmp-export>.csv --month <YYYY-MM>
contentos metrics-ingest site --month <YYYY-MM> --visitors <N> --page-views <N>
```

Then **commit** `metrics/<YYYY-MM>/` so history accumulates.

**3 — Cross metrics with the Calendar (user story 17).** Pull the month's shipped pieces and join
"what published" with "how it performed":

```sh
# the month's published pieces, with their Flag/Side + channel
gh issue list --repo davideimola/content-os --state all --label published \
  --json number,title,labels,closedAt
```

Read `metrics/<YYYY-MM>/linkedin-posts.csv` for the LinkedIn performance and `site.csv` for the
site — then attribute performance to the published set (top performer, laggard, blog traffic).

**4 — Report against the targets (user story 18).**

- **Mix:** the realized **Flag/Side** split (count `flag` vs `side` among the month's published) against
  the **~70% Flag** target.
- **Cadence:** LinkedIn posts this month against the weekly **floor** (≈4/month), blog posts against
  **1/month**. State floor **met** or **missed** — a floor, never a ceiling (user story 14).

**5 — Check the horizon.** Is **next month's blog slot** filled (a `blog` piece `slotted`/`proposed`
for next month)? Any **CFP deadlines** approaching in the `Talks & CFP` view (user story 21)? Name
them so the digest ends forward-looking.

**6 — Ping the digest (user story 19).** One `contentos notify` — the month in numbers, mix and
Cadence vs targets, the horizon, and **grounded recommendations that cite the numbers**:

```sh
contentos notify "June review 📊
LinkedIn: 4 posts · 12,400 impressions · top: <thesis> (4,210). Site: 1,850 visitors.
Mix: 67% Flag (target ~70%) · Cadence: LinkedIn floor met (4), blog met (1).
Next: July blog slot empty ⚠️ · CFP <event> closes <date>.
→ Double down: your Flag post (<thesis>, 4,210) beat the Side one (1,100) ~3.8x — lean Flag.
→ Fill July's blog slot this week."
```

Every "double down on X / drop Y" carries the figure behind it — the review ends on evidence, not a
feeling (user story 19).

## The digest shape

Lead with the month in numbers, then targets, then the horizon, then recommendations — each
recommendation naming the number that justifies it. Keep it scannable (see the
[ping format](notify.md#ping-format)); direct links to the pieces or the board view so a
recommendation is one tap from acting.

## Scheduling (AC4)

Same mechanism as the [Monday Beat](monday-beat.md#scheduling-ac4) (one choice for all Beats,
pending), monthly: **early in the month, Europe/Rome** — GitHub Actions form `cron: '0 6 1 * *'` (the
1st). The body here is the prompt whichever trigger is wired.

## Verification (tracker seam, dry-run)

No unit tests — a Beat is a prompt (the spec's Testing Decisions). Verify with **fixture data**:

1. Ingest a fixture LinkedIn export + site numbers into a throwaway month (use
   `metrics-ingest --metrics-dir <tmp>` so the repo's `metrics/` is untouched), and seed a few
   `published` pieces on the Calendar for that month with Flag/Side + channel labels.
2. Run steps 3–6; confirm the digest **crosses** the metrics with the Calendar (AC1), reports the
   **mix and Cadence against their targets** (AC2), and every **recommendation cites a number** (AC3).
3. Clean up the seed and the throwaway metrics dir.

Verified **2026-07-17** with fixture data: a fixture LinkedIn export + site numbers ingested to a
throwaway metrics dir (repo `metrics/` untouched), three `published` pieces seeded on the Calendar for
June (2 Flag / 1 Side; 2 LinkedIn + 1 blog). The digest **crossed** the metrics with the June
published set, reported the **mix** (67% Flag vs ~70%) and **Cadence** (LinkedIn 2/mo — under the ~4
floor; blog 1 — met) against their targets, and every recommendation **cited its figure** (the Flag
post's 4,210 impressions beat the Side post's 1,100 ~3.8×); delivered via `contentos notify` (exit 0).
Seed and temp dir cleaned up. The trigger (AC4) is deferred with the shared mechanism choice.
