-- ============================================================================
-- The follower level stops lying: keyed by the date it was observed (#113/#98)
-- ============================================================================
-- `metrics_linkedin_account.followers_total` sat on a row keyed by MONTH, but the
-- creator Aggregate Analytics export reports the follower total **at export
-- time** — and the export always arrives after the month has ended. So every
-- value that column could ever carry belongs to a different month than its own
-- key: June's row held 2839, which is the true total on 2026-07-22 (the export
-- date). A level cannot live on a period-keyed row, and prose in a doc cannot fix
-- a key.
--
--   (1) A new table keyed by the OBSERVATION DATE holds the level, with its own
--       verb. The key IS the date the number is true for, so it cannot lie by
--       construction — no convention to read, nothing to mark — and it accrues a
--       real level series for free, one point per ingest.
--   (2) `followers_total` is DROPPED from metrics_linkedin_account, and
--       `p_followers_total` from record_linkedin_account. **The drop is June's
--       repair**: the wrong value leaves with the column, so there is no cleanup
--       write. It also removes the trap — a nullable column that must always stay
--       null is an invitation to the next ingest.
--
-- `impressions`, `members_reached` and `new_followers` STAY on the month row: they
-- are quantities of a period and the period is the row's key. `new_followers` was
-- verified exact and window-independent (identical across two different export
-- windows, #96), so the monthly follower metric loses nothing.
--
-- Console consequences (content-os-web): the Followers tile reads the most recent
-- level record WITH its observation date; the follower chart becomes cumulative
-- growth from the first month with data (the slope is the exact growth, so the
-- curve is true with one point and becomes a series when the backfill lands); the
-- month table shows growth instead of a level.
-- ============================================================================

-- ── (1) the level, keyed by the date it was observed ──────────────────────────
-- `observed_on` is the PRIMARY KEY, not a unique column beside a surrogate id:
-- the row is a FACT identified by its date (like piece_sources / idea_themes,
-- which are keyed by what they are), and one observation per date is the whole
-- point — re-recording a date must replace, never accumulate two truths for one
-- day. `total` is not null: a level record with no level says nothing.
create table metrics_linkedin_followers (
  observed_on date primary key,
  total       int not null check (total >= 0),
  created_at  timestamptz not null default now()
);

alter table metrics_linkedin_followers enable row level security;

-- ── (2) record_linkedin_followers: one observation, replace on re-record ──────
-- Raises on a missing observation date rather than defaulting to today: a level
-- with a guessed date is exactly the lie this table exists to end. Re-recording
-- the same date REPLACES (upsert on the key), so a corrected read of the same day
-- lands as a correction and not as a second row.
create or replace function record_linkedin_followers(p_observed_on date, p_total int)
returns metrics_linkedin_followers
language plpgsql
security definer
set search_path = public
as $$
declare
  row metrics_linkedin_followers;
begin
  if p_observed_on is null then
    raise exception 'observed_on is required: a follower level is only true on the date it was observed';
  end if;
  if p_total is null then
    raise exception 'total is required';
  end if;

  insert into metrics_linkedin_followers (observed_on, total)
  values (p_observed_on, p_total)
  on conflict (observed_on) do update
    set total = excluded.total
  returning * into row;
  return row;
end;
$$;

-- ── (3) the three real observations the table is born with ────────────────────
-- Recovered while settling #98, all read at the moment stated — not derived, not
-- reconstructed (`today's total − later growth` is a lower bound whose error is
-- the accumulated unfollows, so it would have made the curve look steeper than
-- reality; a flattering lie is the worst kind here). 2026-07-22 is the number
-- that was mislabelled as June's.
insert into metrics_linkedin_followers (observed_on, total) values
  ('2026-07-07', 2810),  -- export window ended on the export date
  ('2026-07-22', 2839),  -- the same figure that sat on June's row
  ('2026-07-25', 2844)   -- read live from the LinkedIn UI
on conflict (observed_on) do nothing;

-- ── (4) the level leaves the month row, and the verb's parameters ─────────────
-- Dropped, not nulled: the drop IS the repair. The old 5-argument function is
-- dropped outright (a `create or replace` with fewer arguments would leave it
-- callable), so a caller still passing followers_total FAILS instead of silently
-- writing nothing.
alter table metrics_linkedin_account drop column followers_total;

drop function if exists record_linkedin_account(date, int, int, int, int);

create function record_linkedin_account(
  p_month date,
  p_impressions int,
  p_members_reached int,
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
    (month, impressions, members_reached, new_followers)
  values
    (p_month, p_impressions, p_members_reached, p_new_followers)
  on conflict (month) do update
    set impressions     = excluded.impressions,
        members_reached = excluded.members_reached,
        new_followers   = excluded.new_followers
  returning * into row;
  return row;
end;
$$;

-- ── grants: service_role reads the level; owns the new/changed verbs ──────────
grant select on metrics_linkedin_followers to service_role;

revoke execute on function
  record_linkedin_followers(date, int),
  record_linkedin_account(date, int, int, int)
from public;

grant execute on function
  record_linkedin_followers(date, int),
  record_linkedin_account(date, int, int, int)
to service_role;
