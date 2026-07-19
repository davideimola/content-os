-- ============================================================================
-- Fase-4 write verbs — the Desk's Piece + Talk hands (ADR-0015)
-- ============================================================================
-- Atomic, security-definer RPCs called by the content-os MCP adapter with the
-- service_role key. None is granted to anon: the capture door stays insert-only,
-- these are privileged (grants live in the next migration). They mirror the
-- capture_idea pattern in the init migration. `updated_at` bumps via the existing
-- triggers. Verbs contracted in docs/design/supabase-foundations.md (RPC verbs).
--
-- Note: slot/deslot/decline set `state` UNCONDITIONALLY (no from-state guard).
-- That is safe while no verb in this slice reaches in_production/published; add
-- transition guards when the advance verbs land, not before (avoid guarding
-- states that cannot yet occur).
-- ============================================================================

-- ── spawn_piece: a proposed Piece + its source-Idea links, one tx ────────────
create or replace function spawn_piece(
  p_channel   piece_channel,
  p_flag_side flag_side,
  p_title     text,
  p_idea_ids  text[] default '{}'
)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  new_piece pieces;
  v_idea_id text;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title is required';
  end if;

  insert into pieces (channel, flag_side, title)
  values (p_channel, p_flag_side, p_title)
  returning * into new_piece;

  -- Link source Ideas. The FK to ideas(id) makes a bad id abort the whole tx.
  foreach v_idea_id in array coalesce(p_idea_ids, '{}')
  loop
    insert into piece_sources (piece_id, idea_id)
    values (new_piece.id, v_idea_id)
    on conflict do nothing;
  end loop;

  return new_piece;
end;
$$;

-- ── slot_piece: put a Piece on the Calendar (proposed/reslot -> slotted) ──────
create or replace function slot_piece(p_id text, p_publish_date date)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  slotted pieces;
begin
  if p_publish_date is null then
    raise exception 'publish_date is required to slot a piece';
  end if;

  update pieces
     set state = 'slotted', publish_date = p_publish_date
   where id = p_id
  returning * into slotted;

  if not found then
    raise exception 'piece % not found', p_id;
  end if;

  return slotted;
end;
$$;

-- ── deslot_piece: pull a Piece off the Calendar (back to proposed) ────────────
create or replace function deslot_piece(p_id text)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  deslotted pieces;
begin
  update pieces
     set state = 'proposed', publish_date = null
   where id = p_id
  returning * into deslotted;

  if not found then
    raise exception 'piece % not found', p_id;
  end if;

  return deslotted;
end;
$$;

-- ── decline_piece: keep the proposal on the record, off the Calendar ─────────
-- Declining clears publish_date too: a declined Piece is not scheduled, so it
-- must not linger on the Calendar.
create or replace function decline_piece(p_id text)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  declined pieces;
begin
  update pieces
     set state = 'declined', publish_date = null
   where id = p_id
  returning * into declined;

  if not found then
    raise exception 'piece % not found', p_id;
  end if;

  return declined;
end;
$$;

-- ── spawn_talk: a proposed Talk + its source-Idea links, one tx ──────────────
create or replace function spawn_talk(
  p_flag_side flag_side,
  p_title     text,
  p_idea_ids  text[] default '{}'
)
returns talks
language plpgsql
security definer
set search_path = public
as $$
declare
  new_talk talks;
  v_idea_id text;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title is required';
  end if;

  insert into talks (flag_side, title)
  values (p_flag_side, p_title)
  returning * into new_talk;

  foreach v_idea_id in array coalesce(p_idea_ids, '{}')
  loop
    insert into talk_sources (talk_id, idea_id)
    values (new_talk.id, v_idea_id)
    on conflict do nothing;
  end loop;

  return new_talk;
end;
$$;

-- ── decline_talk: keep the proposal on the record, mark it declined ──────────
create or replace function decline_talk(p_id text)
returns talks
language plpgsql
security definer
set search_path = public
as $$
declare
  declined talks;
begin
  update talks
     set state = 'declined'
   where id = p_id
  returning * into declined;

  if not found then
    raise exception 'talk % not found', p_id;
  end if;

  return declined;
end;
$$;

-- ── untriaged_proposals: widen the contracted view (single source) ───────────
-- The view already defines "a proposal" (init migration) and is the Beats'
-- staleness signal. Widen it with the fields the Desk needs (channel/flag_side/
-- created_at) so list_proposals reads ONE definition instead of re-deriving it
-- in the adapter (ADR-0015: the adapter holds no logic of its own). kind/id/
-- title keep their position, so the Beats' reads are unaffected.
create or replace view untriaged_proposals as
  select 'piece'::text as kind, id, title, channel, flag_side, created_at
    from pieces where state = 'proposed'
  union all
  select 'talk'::text  as kind, id, title, null::piece_channel as channel, flag_side, created_at
    from talks  where state = 'proposed';
