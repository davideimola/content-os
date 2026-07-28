-- ============================================================================
-- Theme on the output: a Piece carries its sources' Themes, correctable (#112)
-- ============================================================================
-- A Theme is a property of the CONTENT, so it belongs on the output and not only
-- on the spark. Carried by Ideas alone (#78) it can't be counted over Pieces —
-- the same metre as Cadence and the Flag mix — so it says nothing editorial,
-- because it never reaches the thing that shipped.
--
-- This migration mirrors the Idea side exactly: a `piece_themes` join with the
-- same many-to-many shape and the same double cascade, a replace-all
-- `set_piece_themes` verb alongside `set_idea_themes`, and the same
-- service_role-only grants. The vocabulary itself (`themes`, its partial unique
-- index on live labels, `create_theme`/`archive_theme`) is unchanged and shared.
--
-- Two things are new in kind, not in shape:
--
--   1. **Inheritance at spawn.** A Piece comes from Ideas, so it starts with
--      their Themes:
--
--        piece_themes(piece) = U { live themes of idea | idea in piece_sources(piece) }
--
--      LIVE themes only — an archived Theme is retired vocabulary and must not be
--      inherited afresh. An already-assigned Theme that is later archived keeps
--      its row (archive_theme flips a flag, it never deletes), so its label still
--      resolves — honest history, exactly as on the Idea side.
--
--   2. **The inheritance is a default to correct, not the truth.** One output
--      covers one angle while its sources range wider, and measured against the
--      live Pipeline derivation alone is provably insufficient: of the 18 Pieces
--      here, 2 have no source Idea at all, 4 end with no Theme and 10 inherit two
--      or more (2 inherit three). Hence `set_piece_themes` ships in the same
--      slice, and the console's Piece drawer reuses the Idea tagger.
--
-- The 18 existing Pieces are backfilled at the foot with the same derivation, so
-- the model is true of the whole corpus and not only of what is spawned next.
-- ============================================================================

-- ── table ─────────────────────────────────────────────────────────────────────
-- Piece <-> theme, many-to-many, mirroring idea_themes: assignment is replace-all
-- (set_piece_themes), so there is no per-row lifecycle; the cascade on both sides
-- keeps the join clean if either end is deleted. Assigning does NOT bump
-- pieces.updated_at (the Idea side behaves the same) — tagging is not an edit of
-- the content.
create table piece_themes (
  piece_id text not null references pieces(id) on delete cascade,
  theme_id text not null references themes(id) on delete cascade,
  primary key (piece_id, theme_id)
);

-- ── the derivation, once ──────────────────────────────────────────────────────
-- The union above, as one definition both spawn_piece and the backfill call, so
-- "a Piece's inherited Themes" can never mean two different things. ADDITIVE
-- (`on conflict do nothing`): it seeds a default and never removes a hand
-- correction. Internal — not granted to service_role, reached only through
-- spawn_piece (which is security definer, so it runs as this function's owner).
-- There is deliberately no re-derive verb: re-deriving after a correction would
-- have to decide whether to overwrite it, and the correction is the truth.
create or replace function derive_piece_themes(p_piece_id text)
returns void
language sql
set search_path = public
as $$
  insert into piece_themes (piece_id, theme_id)
  select distinct ps.piece_id, it.theme_id
    from piece_sources ps
    join idea_themes it on it.idea_id = ps.idea_id
    join themes t       on t.id = it.theme_id
   where ps.piece_id = p_piece_id
     and not t.archived           -- retired vocabulary is never inherited afresh
  on conflict do nothing;
$$;

-- ── spawn_piece: unchanged, plus the inheritance ──────────────────────────────
-- Same signature and same body as before (a proposed Piece + its source-Idea
-- links, one tx); the derivation runs last, inside the same transaction, so a
-- Piece is never briefly visible without the Themes it inherited.
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

  -- Inherit the source Ideas' live Themes — a default to correct, not the truth.
  perform derive_piece_themes(new_piece.id);

  return new_piece;
end;
$$;

-- ── set_piece_themes: the hand correction ─────────────────────────────────────
-- Replace-all and idempotent, the twin of set_idea_themes: the Piece ends
-- carrying EXACTLY the given set — re-calling with a subset removes the rest,
-- `{}` clears it (which is how a wrongly inherited Theme comes off). Dedups the
-- input; the FK on theme_id aborts the tx on an unknown theme. An ARCHIVED theme
-- id is accepted: it can already be on a Piece (inherited before it was retired),
-- so refusing it would make that set unrepresentable and turn every correction of
-- such a Piece into a silent loss. Returns the resulting rows so the caller can
-- assert the set landed.
create or replace function set_piece_themes(p_piece_id text, p_theme_ids text[])
returns setof piece_themes
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from pieces where id = p_piece_id) then
    raise exception 'piece % not found', p_piece_id;
  end if;

  delete from piece_themes where piece_id = p_piece_id;

  insert into piece_themes (piece_id, theme_id)
  select distinct p_piece_id, t
  from unnest(coalesce(p_theme_ids, '{}'::text[])) as t;

  return query select * from piece_themes where piece_id = p_piece_id;
end;
$$;

-- ── RLS: deny-by-default, like the rest of the schema ─────────────────────────
alter table piece_themes enable row level security;

-- ── grants ────────────────────────────────────────────────────────────────────
-- service_role reads the join directly (the console resolves a Piece's themes and
-- coverage is counted over Pieces); no DML grant — the verb is security definer.
grant select on piece_themes to service_role;

-- Privileged verbs: service_role only, never PUBLIC/anon (the semi-public anon key
-- must not reach them via raw PostgREST). derive_piece_themes is revoked from
-- PUBLIC and granted to nobody: it is internal to spawn_piece.
revoke execute on function
  derive_piece_themes(text),
  set_piece_themes(text, text[])
from public;

grant execute on function set_piece_themes(text, text[]) to service_role;

-- ── backfill: the existing corpus, same derivation ────────────────────────────
-- Measured before writing this, against the live Pipeline: 18 Pieces, 2 with no
-- source Idea, and the derived distribution 0->4, 1->4, 2->8, 3->2 — i.e. 4 of 18
-- with no Theme and 10 of 18 with two or more, which is the shape the spec
-- records. Additive per Piece, so re-running is a no-op.
do $$
declare
  v_piece_id text;
begin
  for v_piece_id in select id from pieces loop
    perform derive_piece_themes(v_piece_id);
  end loop;
end;
$$;
