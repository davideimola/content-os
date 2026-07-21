-- ============================================================================
-- ready replaces in_production on the Piece lifecycle (ADR-0018)
-- ============================================================================
-- `in_production` never earned its keep on the Piece: no verb ever set it, and
-- publish_piece (ADR-0017) advances slotted -> published directly, skipping it —
-- an unreachable enum value whose only reader (cadence_status) matched a state
-- nothing could produce. Its name was wrong too: "in production" is a process
-- whose truth lives in the Factory's PR; the Pipeline should record the milestone
-- the PR does not express — "written, in the can, awaiting its date" = `ready`,
-- already the Talk ladder's word for the same thing.
--
-- This migration: (1) renames the Piece enum value, (2) adds mark_ready
-- (slotted -> ready, the twin of publish_piece), (3) widens publish_piece to
-- {slotted, ready} (amends ADR-0017 dec.2), (4) rebuilds cadence_status so a
-- `ready` Piece counts as covered. The Talk ladder is untouched: Talks keep both
-- in_production and ready. Verbs contracted in docs/design/supabase-foundations.md.
-- ============================================================================

-- ── (1) rename the Piece enum value (no row migration — nothing was ever there) ──
alter type piece_state rename value 'in_production' to 'ready';

-- ── (2) mark_ready: a Piece is prepared ahead (slotted -> ready) ──────────────
-- FROM-state guarded like publish_piece: ready only from `slotted`, keeping the
-- calendar publish_date. Records the fact "prepared ahead" — the console's
-- "Mark ready" tap (ADR-0018 dec.2/4), not editorial planning.
create or replace function mark_ready(p_id text)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  readied pieces;
begin
  update pieces
     set state = 'ready'
   where id = p_id and state = 'slotted'
  returning * into readied;

  if not found then
    -- Distinguish missing from wrong-state so the caller gets a clear reason.
    if not exists (select 1 from pieces where id = p_id) then
      raise exception 'piece % not found', p_id;
    end if;
    raise exception 'piece % must be slotted to mark ready', p_id;
  end if;

  return readied;
end;
$$;

revoke execute on function mark_ready(text) from public;
grant  execute on function mark_ready(text) to service_role;

-- ── (3) publish_piece widens to {slotted, ready} (amends ADR-0017 dec.2) ──────
-- The batch path is slotted -> ready -> published, but a Piece written and shipped
-- the same day may still go slotted -> published directly: `ready` is a station,
-- not a tollgate. Still from-state-guarded — rejects proposed / already-published.
create or replace function publish_piece(p_id text)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  published pieces;
begin
  update pieces
     set state = 'published'
   where id = p_id and state in ('slotted', 'ready')
  returning * into published;

  if not found then
    if not exists (select 1 from pieces where id = p_id) then
      raise exception 'piece % not found', p_id;
    end if;
    raise exception 'piece % must be slotted or ready to publish', p_id;
  end if;

  return published;
end;
$$;

-- ── (4) cadence_status: a `ready` Piece counts as covered ─────────────────────
-- Same shape/columns as the init view; the two `in_production` branches become
-- `ready`. A Piece dated in the window is MORE covered when ready (it's done).
create or replace view cadence_status as
  select
    exists (
      select 1 from pieces
      where channel = 'linkedin' and (
        (state = 'published' and publish_date >= date_trunc('week', current_date)) or
        (state in ('slotted', 'ready')
         and publish_date between current_date and (date_trunc('week', current_date) + interval '6 days'))
      )
    ) as linkedin_week_covered,
    exists (
      select 1 from pieces
      where channel = 'blog'
        and publish_date >= date_trunc('month', current_date)
        and state in ('slotted', 'ready', 'published')
    ) as blog_month_covered;
