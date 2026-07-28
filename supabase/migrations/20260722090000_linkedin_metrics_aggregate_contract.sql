-- ============================================================================
-- LinkedIn metrics contract follows the aggregate export (ADR-0019)
-- ============================================================================
-- The documented per-post contract (date, post_url, impressions, reactions,
-- comments, reshares) never matched what LinkedIn actually hands a private
-- individual. The only self-serve export (the creator "Aggregate Analytics"
-- XLSX — no programmatic pull without a legal entity, see
-- docs/research/linkedin-personal-analytics-api.md) gives, per post, only
-- IMPRESSIONS and a single combined ENGAGEMENTS — never the reaction/comment/
-- reshare split — and its numbers are PER-PERIOD (a post's per-post impressions
-- sum to the month's account total), not lifetime. It also carries account-level
-- figures we were discarding: monthly impressions, members reached, and follower
-- count + growth.
--
-- This migration realigns the contract to that reality:
--   (1) metrics_linkedin_posts: drop the never-fillable split (reactions,
--       comments, shares, clicks) and the never-populated piece_id; add
--       `engagements`.
--   (2) new metrics_linkedin_account: the monthly account-level snapshot.
--   (3) pieces.linkedin_post_url: the declarative Piece<->post link. Per-period
--       data means one post has a row per month it stayed active, so we link the
--       Piece to the post's stable identity (its URL), not to one metric row —
--       the join then rolls up every monthly slice (present and future), and a
--       Piece's lifetime total is the SUM over its rows. This replaces the
--       dropped piece_id.
--   (4) ingest_linkedin_metrics reworked to the {posted_on, post_url,
--       impressions, engagements} row shape (still delete+insert per month,
--       idempotent).
--   (5) record_linkedin_account: upsert a month's account snapshot.
--   (6) set_piece_linkedin_url: attach a LinkedIn post URL to a linkedin Piece.
-- Contract recorded in docs/adr/0019-*.md and docs/design/supabase-foundations.md.
-- ============================================================================

-- ── (1) metrics_linkedin_posts: impressions + combined engagements ────────────
alter table metrics_linkedin_posts drop column if exists reactions;
alter table metrics_linkedin_posts drop column if exists comments;
alter table metrics_linkedin_posts drop column if exists shares;
alter table metrics_linkedin_posts drop column if exists clicks;
alter table metrics_linkedin_posts drop column if exists piece_id;
alter table metrics_linkedin_posts add  column engagements int;

-- ── (2) metrics_linkedin_account: the monthly account-level snapshot ──────────
-- One row per month (unique), upserted. `new_followers` is that month's growth
-- (sum of the export's daily "New followers"). `followers_total` was meant to be
-- the follower level and never could be: the export reports the total at export
-- time, always after the month has ended, so the value never belonged to its own
-- key. It is DROPPED (with `p_followers_total`) by
-- 20260728172539_follower_level_keyed_by_observation_date.sql, which moves the
-- level to a table keyed by the date it was observed (#113/#98). Kept separate
-- from metrics_site (which is the website).
create table metrics_linkedin_account (
  id              text primary key default gen_prefixed_id('mla'),
  month           date not null unique,
  impressions     int,
  members_reached int,
  followers_total int,
  new_followers   int,
  created_at      timestamptz not null default now()
);

alter table metrics_linkedin_account enable row level security;

-- ── (3) pieces.linkedin_post_url: the declarative Piece<->post link ───────────
alter table pieces add column linkedin_post_url text;

-- ── (4) ingest_linkedin_metrics: new row shape, still idempotent per month ────
-- The adapter parses the export CSV to a validated jsonb array; this replaces the
-- month wholesale (delete + insert in one tx). Rows now carry only impressions +
-- engagements (the export has no reaction/comment/reshare split).
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
    (month, posted_on, post_url, impressions, engagements)
  select p_month,
         (r->>'posted_on')::date,
         r->>'post_url',
         (r->>'impressions')::int,
         (r->>'engagements')::int
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ── (5) record_linkedin_account: upsert a month's account snapshot ────────────
create or replace function record_linkedin_account(
  p_month date,
  p_impressions int,
  p_members_reached int,
  p_followers_total int,
  p_new_followers int
)
returns metrics_linkedin_account
language plpgsql
security definer
set search_path = public
as $$
declare
  row metrics_linkedin_account;
begin
  insert into metrics_linkedin_account
    (month, impressions, members_reached, followers_total, new_followers)
  values
    (p_month, p_impressions, p_members_reached, p_followers_total, p_new_followers)
  on conflict (month) do update
    set impressions     = excluded.impressions,
        members_reached = excluded.members_reached,
        followers_total = excluded.followers_total,
        new_followers   = excluded.new_followers
  returning * into row;
  return row;
end;
$$;

-- ── (6) set_piece_linkedin_url: attach a post URL to a linkedin Piece ─────────
-- Guarded to channel = 'linkedin' (only a LinkedIn Piece maps to a LinkedIn post);
-- a null/empty URL clears the link. The console's link picker is the caller.
create or replace function set_piece_linkedin_url(p_id text, p_url text)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  linked pieces;
begin
  update pieces
     set linkedin_post_url = nullif(btrim(p_url), '')
   where id = p_id and channel = 'linkedin'
  returning * into linked;

  if not found then
    if not exists (select 1 from pieces where id = p_id) then
      raise exception 'piece % not found', p_id;
    end if;
    raise exception 'piece % must be a linkedin Piece to link a post URL', p_id;
  end if;

  return linked;
end;
$$;

-- ── grants: service_role reads the new table; owns the new/changed verbs ──────
grant select on metrics_linkedin_account to service_role;

revoke execute on function
  record_linkedin_account(date, int, int, int, int),
  set_piece_linkedin_url(text, text)
from public;

grant execute on function
  record_linkedin_account(date, int, int, int, int),
  set_piece_linkedin_url(text, text)
to service_role;
