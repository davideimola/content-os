---
name: review
description: Open the Review — the interactive monthly session over the Content OS Pipeline, the monthly sibling of /desk. Run the Metrics snapshot ritual, ingest via the content-os MCP tools (ingest_linkedin_metrics / record_site_metrics), cross the numbers with the Calendar, and report the realized Flag/Side mix vs ~70% and Cadence vs the floor — counted over Pieces — with number-cited recommendations. Use when Davide wants to run the monthly review (turn a month's metrics into next month's steer), or when the Monthly reminder nudges him.
---

# The Review

The **Review** is to the month what the [Desk](../../../CONTEXT.md) is to the week: the interactive
session where Davide turns a month of output into next month's steer, present in the loop — the session
the monthly [Beat](../../../CONTEXT.md) only *reminds* him to open (the Beats no longer analyze; they
detect staleness and nudge — ADR-0013). Like the Desk, the Review **judges and reports; it never drafts
content** ([ADR-0002](../../../docs/adr/0002-no-app-repo-plus-claude-routines.md)). It reads and writes
the Pipeline through the **content-os MCP tools** (the ops adapter over Supabase,
[ADR-0015](../../../docs/adr/0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md) /
[ADR-0014](../../../docs/adr/0014-pipeline-source-of-truth-moves-to-supabase.md)).

## The procedure lives in one place

The Review's steps — the metrics ritual, the ingest, the cross with the Calendar, the mix and Cadence
report — are the single procedure in
[`monthly-beat.md`](../../../docs/agents/monthly-beat.md). **Read it now and run its six steps in order**
with Davide; it is not restated here. This skill holds only what running it *live* adds.

## Running it live

- **You are the brain.** The judgement is you (Claude) + Davide reading the numbers together — never an
  autonomous model.
- **Ask, then wait** — step 1 needs Davide's LinkedIn export and site numbers. Request them and pause;
  the Review never invents data.
- **Cross before you conclude** — join the metrics (`get_metrics`) to the month's published Pieces
  (`list_calendar`, step 3) before any steer, so every recommendation is grounded.
- **Over Pieces** — mix and Cadence are ratios over **Pieces, never Ideas**, computed over the reviewed
  month's published Pieces (not the lifetime `flag_mix` view).
- **Cite the number** — each recommendation names the figure behind it; a steer without a number is not
  ready to give.

## The one write: ingest the metrics

The only thing the Review writes is the month's numbers into the DB — `ingest_linkedin_metrics` and
`record_site_metrics` (step 2). There are **no committed metrics files** anymore: the numbers live in the
Pipeline, and re-ingesting a corrected export just replaces the month. The report itself is **live in the
session**; send it as a [ping](../../../docs/agents/notify.md) only if Davide asks (`notify_ping`, step 6).

## Guardrails

- **One source of truth** — the procedure is [`monthly-beat.md`](../../../docs/agents/monthly-beat.md);
  read it, never copy it here.
- **Never drafts content** — the Review reports and steers; the Factories write.
- **Human-in-the-loop** — personal LinkedIn analytics can't be pulled programmatically, so the numbers
  come from Davide, never from a guess.
- **Scope guard** — the Review ingests metrics and reads the Calendar and reports. It does **not**
  correlate Ideas or move Pieces — that is the [Desk](../../../CONTEXT.md).

## Verify

No unit tests — a prompt is driven, not tested. The ops-seam fixture procedure lives with the procedure,
in [`monthly-beat.md`](../../../docs/agents/monthly-beat.md#verification-ops-seam-fixture-data).
