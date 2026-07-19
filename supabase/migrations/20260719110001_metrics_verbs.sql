-- ============================================================================
-- Fase-4 metrics verbs — the Review's ingest hands (ADR-0015)
-- ============================================================================
-- Replaces the retired `contentos metrics-ingest` (ADR-0009 -> ADR-0015): the
-- deterministic CSV parse now lives in the content-os MCP adapter (TypeScript),
-- and these RPCs do the atomic write. The Review reads the numbers back through
-- the flag_mix / cadence_status views + the metrics tables. service_role only.
-- ============================================================================

-- ── ingest_linkedin_metrics: replace a month's LinkedIn posts, atomically ─────
-- The adapter parses the export CSV to a validated jsonb array; this replaces the
-- month wholesale (delete + insert in one tx), so re-ingesting a corrected export
-- is idempotent. `shares` maps from the export's `reshares`; `clicks`/`piece_id`
-- are not in the export (left null; a post is linked to its Piece later).
create or replace function ingest_linkedin_metrics(p_month date, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  delete from metrics_linkedin_posts where month = p_month;

  insert into metrics_linkedin_posts
    (month, posted_on, post_url, impressions, reactions, comments, shares)
  select p_month,
         (r->>'posted_on')::date,
         r->>'post_url',
         (r->>'impressions')::int,
         (r->>'reactions')::int,
         (r->>'comments')::int,
         (r->>'shares')::int
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ── record_site_metrics: upsert a month's site numbers (month is unique) ──────
create or replace function record_site_metrics(p_month date, p_visitors int, p_page_views int)
returns metrics_site
language plpgsql
security definer
set search_path = public
as $$
declare
  row metrics_site;
begin
  insert into metrics_site (month, visitors, page_views)
  values (p_month, p_visitors, p_page_views)
  on conflict (month) do update
    set visitors = excluded.visitors, page_views = excluded.page_views
  returning * into row;
  return row;
end;
$$;

-- ── grants: service_role reads the metrics + views; owns the write verbs ──────
grant select on metrics_linkedin_posts, metrics_site, flag_mix, cadence_status to service_role;

revoke execute on function
  ingest_linkedin_metrics(date, jsonb),
  record_site_metrics(date, int, int)
from public;

grant execute on function
  ingest_linkedin_metrics(date, jsonb),
  record_site_metrics(date, int, int)
to service_role;
