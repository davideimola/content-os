---
status: accepted
relates: [ADR-0009, ADR-0014, ADR-0015, ADR-0016]
---

# The LinkedIn metrics contract follows the aggregate export

The metrics ingest contract — documented in [`metrics-ingest.md`](../agents/metrics-ingest.md) and coded in
the MCP adapter ([ADR-0015](0015-operations-surface-is-an-mcp-adapter-over-the-rpc-contract.md)) — asked for
a per-post CSV with `date, post_url, impressions, reactions, comments, reshares`, and stored a
`piece_id`-per-post link. That contract was written from an assumption about a per-post export that a
private individual **cannot actually produce**: programmatic pull is gated behind a registered legal entity
(see [the research](../research/linkedin-personal-analytics-api.md)), so the only self-serve source is the
creator **Aggregate Analytics** XLSX.

Checking a real export (`AggregateAnalytics_…_2026-06.xlsx`) against the contract, three mismatches:

1. **No reaction/comment/reshare split.** The export's per-post sheet (TOP POSTS) gives, per post, only
   `impressions` and a single combined **`engagements`**. The four-way split the contract required is not in
   the export at all — filling it would mean hand-reading every post from the UI each month.
2. **Per-period, not lifetime.** The per-post impressions **sum to the month's account total** (11 posts →
   450 = the DISCOVERY total). So a still-active post recurs in later months' exports with that month's
   slice; a post's lifetime total is the **sum** across months, not "the latest snapshot" — the opposite of
   what a lifetime assumption would do.
3. **Account-level figures were discarded.** The export also carries monthly `impressions` + `members
   reached` (DISCOVERY) and `followers_total` + monthly growth (FOLLOWERS) — top-line signal for a creator,
   which the contract had nowhere to put.

The fix is to make the contract mirror **what LinkedIn actually exports**, and to give the console a window
onto it (closing the "no view on performance" gap that motivated [ADR-0016](0016-management-web-ui-writes-through-the-rpc-contract.md)'s
console in the first place).

## Decisions

1. **Per-post = `impressions` + combined `engagements`.** Drop `reactions`, `comments`, `shares`, `clicks`
   from `metrics_linkedin_posts`; add `engagements`. The ingest CSV contract becomes
   `date, post_url, impressions, engagements`.

2. **Account-level = a new table `metrics_linkedin_account`** (`month` unique, `impressions`,
   `members_reached`, `followers_total`, `new_followers`), upserted by a new verb `record_linkedin_account`.
   `metrics_site` (the **website**, from Umami/Vercel) is untouched — a separate axis.

3. **The Piece↔post link is `pieces.linkedin_post_url`, joined by URL — not `piece_id`.** Per-period data
   means one post has a row per active month, so the link points at the post's **stable identity** (its
   URL); the join then rolls up every monthly slice (present *and future*), and a Piece's total is the
   **sum** over its rows. The never-populated `metrics_linkedin_posts.piece_id` is dropped. A new verb
   `set_piece_linkedin_url(id, url)` sets it, **guarded to `channel = 'linkedin'`** (a null/empty URL
   clears it).

4. **The deterministic parse stays a CSV, server-side; the Review turns the XLSX into it.** The adapter does
   **not** learn to read the multi-sheet binary XLSX — that would couple the deterministic seam to LinkedIn's
   layout, brittle to every LinkedIn redesign. Turning the messy export into the contract is the monthly
   [Review](../../CONTEXT.md)'s judgement job (already the rule, `metrics-ingest.md`): it reads the XLSX
   **live in-session** (an XLSX is a zip of XML) per a documented sheet map, and calls the tools.

5. **New RPC verbs: `record_linkedin_account`, `set_piece_linkedin_url`.** `ingest_linkedin_metrics` keeps
   its name and idempotent per-month delete+insert, with the new row shape. MCP-adapter parity for
   `set_piece_linkedin_url` is **deferred** (additive-later, same YAGNI as the edit verbs / `publish_piece` —
   no MCP consumer links posts yet; the console calls the verb directly).

6. **The console gets the performance window.** Overview: a "This month on LinkedIn" tile row (impressions,
   members reached, engagements, followers) with month-over-month deltas, off the latest month with data.
   Pipeline: the per-Piece cross in the detail drawer — a linked LinkedIn Piece shows its impressions +
   engagements summed across months (and a link/unlink control); a blog Piece shows its publish-month
   **site-wide** visitors, clearly labelled (there is no per-blog-post metric — `metrics_site` is monthly).

## Considered Options

- **Keep the four-way split, hand-enter it monthly.** Rejected: the export doesn't carry it, so it means
  reading every post off the LinkedIn UI by hand each month. For a personal system at ~4 posts/month the
  split does not earn that recurring manual cost; `engagements` is what the tool produces for free.
- **Teach the adapter to parse the XLSX.** Rejected: it hard-couples the deterministic parser to LinkedIn's
  five-sheet layout (brittle), and duplicates judgement that already lives in the Review.
- **Auto-link post↔Piece by matching `post_url` against `artifact_url`.** Rejected: a Piece's `artifact_url`
  is the Factory draft/PR, not the LinkedIn permalink — the match is unreliable. The link is explicit.
- **Keep `metrics_linkedin_posts.piece_id`, set it on ingest.** Rejected: with per-period data, future
  monthly slices of the same post would arrive unlinked; a declarative URL on the Piece rolls up every slice
  with no re-linking.
- **Treat the numbers as lifetime (latest snapshot wins).** Rejected: proven per-period (per-post
  impressions sum to the month total), so the correct rollup is a sum across months.

## Consequences

- **The RPC contract changes** (`supabase/migrations/…_linkedin_metrics_aggregate_contract.sql`):
  `metrics_linkedin_posts` loses the split + `piece_id` and gains `engagements`; new
  `metrics_linkedin_account`; `pieces.linkedin_post_url`; reworked `ingest_linkedin_metrics`; new
  `record_linkedin_account` + `set_piece_linkedin_url` (`security definer`, `service_role`-only).
  `docs/design/supabase-foundations.md` tracks the schema + verb table.
- **The MCP adapter** (`supabase/functions/capture-mcp/index.ts`): the parser's column set and row shape,
  the `ingest_linkedin_metrics` description, a new `record_linkedin_account` tool, and `get_metrics` now
  returning per-post `impressions/engagements` + the account snapshot + the site numbers.
- **`content-os-web`** gains the metrics reads (`src/lib/pipeline.ts`), the `MetricTile`
  (`src/components/view.tsx`), a `setPieceLinkedinUrl` Server Action (`src/lib/actions.ts`), the Overview
  tiles (`src/app/page.tsx`), and the per-Piece cross in the drawer (`src/app/pipeline/page.tsx`,
  `src/components/detail/piece-detail.tsx`).
- **Docs**: `metrics-ingest.md` (contract + XLSX sheet map + per-period note), `monthly-beat.md` (the
  Review's steps), the Review skill, and CONTEXT.md's **Metrics snapshot** term + the CLAUDE.md
  *metrics-ingest seam* section.
- **Gap found, not fixed here:** `service_role` has no `SELECT` grant on `engagements`/`events`, so the
  console's `getCalendarItems` fails on a locked-down DB (surfaced on local; production works only if the
  grant was applied out-of-band). A grant migration is the fix — out of scope for this ADR, tracked
  separately.
- **Verified at the seams** (no unit tests): the June export ingests to per-post `impressions` summing to
  450 and `engagements` to 11; a re-ingest replaces the month; `record_linkedin_account` upserts;
  `set_piece_linkedin_url` links a `linkedin` Piece and raises on a `blog` one; the per-Piece URL join
  returns the linked post's total; the console's Overview renders the month's tiles with deltas and the
  Pipeline passes the per-Piece metrics to the drawer.
