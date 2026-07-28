-- ============================================================================
-- merge_themes: fold two Themes into one — the vocabulary's only way back (#121)
-- ============================================================================
-- The theme model has no escape hatch. `create_theme` mints, `archive_theme`
-- retires, and nothing folds two near-duplicates together — so the vocabulary can
-- only GROW. "AI agents" and "AI & the craft" both existing is not a data error
-- either verb can fix: archiving one strands every Idea and Piece that carries it
-- on retired vocabulary, and the assignments would have to be redone by hand, one
-- item at a time, through `set_idea_themes` / `set_piece_themes`. Six legible hubs
-- become thirty illegible ones with no way back, and that is the real risk the
-- moment anything starts PROPOSING Themes (#121's motivation: merge is that
-- change's prerequisite, and lands before it).
--
-- Merge is one act with four parts, in one transaction:
--
--   1. every idea_themes row on the absorbed Theme comes to resolve to the survivor
--   2. every piece_themes row does the same — BOTH joins, never one (the trap #112
--      already hit once with the console's `inUse` check, which had to be widened to
--      span both; a merge that reasoned over Ideas alone would silently strand the
--      output side, which is the side coverage is counted over)
--   3. duplicates COLLAPSE: an Idea or Piece that carried both Themes ends with the
--      survivor once, not twice — the composite primary key makes that automatic
--      rather than a case to handle
--   4. the absorbed Theme is ARCHIVED, which keeps its record: it is retired
--      vocabulary, never a deleted row (the same flag `archive_theme` writes, so a
--      merge cannot lose history)
--
-- Merge is nonetheless a ONE-WAY act through the contract, and deliberately so:
-- the moved assignments can each be re-set with `set_idea_themes`/`set_piece_themes`,
-- but nothing un-archives a Theme — there is no `unarchive_theme` verb today, on
-- either surface. That is why this verb raises on every ambiguous input instead of
-- guessing, and why the survivor must be named deliberately.
--
-- The invariant that makes it a merge and not a delete: after it, NO Idea or Piece
-- references the absorbed Theme, and NONE lost a Theme it had — the set each item
-- carries maps 1:1 onto what it carried before, with the absorbed id rewritten to
-- the survivor's.
--
-- `themes_live_label_uniq` (the partial unique index on live labels) stays the
-- guarantee that the vocabulary cannot split, and merge preserves it trivially: it
-- creates no new live label — the survivor's is unchanged and the absorbed one is
-- archived, which FREES that label. So a merge is a repair, not a lock: nothing
-- stops `create_theme('AI & the craft')` minting it live again afterwards. That is
-- the documented behaviour of the partial index (retiring a label frees it), and
-- the reason this verb exists at all is that the repair is now cheap.
--
-- If a third join onto `themes` is ever added (a `talk_themes`, say — Talks carry
-- Themes in the glossary but not yet in the schema), it MUST be added here too:
-- this verb is the one place that has to know every table pointing at a theme id.
-- ============================================================================

-- merge_themes: fold the absorbed Theme into the survivor. Returns both Themes and
-- how much moved, so a caller can assert the fold landed without a second read.
--
-- Argument order mirrors `block_piece(p_blocked_id, p_blocker_id)`: the row being
-- acted on first (the absorbed Theme is the one that changes), the other second.
--
-- `ideas_moved` / `pieces_moved` count the assignments that WERE on the absorbed
-- Theme and now resolve to the survivor. A duplicate is counted as moved even
-- though it created no new row: the assignment moved, it just landed on a row that
-- was already there. So `ideas_moved` is what the absorbed Theme carried, and the
-- survivor grows by at most that much.
--
-- Raises on:
--   - either id unknown — a typo'd id must not silently no-op
--   - the same id twice — merging a Theme into itself would archive the very Theme
--     it just moved everything onto, i.e. quietly retire a live subject; there is
--     no reading of that as a no-op
--   - an ARCHIVED survivor — merge decides the vocabulary GOING FORWARD, so folding
--     live assignments into retired vocabulary is a loss, not a repair (it would
--     leave every moved item with no live Theme and no live label to pick it by).
--     `set_piece_themes` accepts an archived id because it PRESERVES a set that
--     already exists; merge CREATES the set it writes, which is the difference.
--     An archived ABSORBED Theme is fine and deliberately supported: an archived
--     Theme can still be carried (that is exactly what #112 made possible), and
--     folding those leftovers onto a live Theme is the repair.
create or replace function merge_themes(p_absorbed_id text, p_survivor_id text)
returns table (
  survivor_id    text,
  survivor_label text,
  absorbed_id    text,
  absorbed_label text,
  ideas_moved    integer,
  pieces_moved   integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  absorbed themes;
  survivor themes;
  v_ideas  integer;
  v_pieces integer;
begin
  if p_absorbed_id is not null and p_absorbed_id = p_survivor_id then
    raise exception 'cannot merge theme % into itself', p_absorbed_id;
  end if;

  select * into absorbed from themes where id = p_absorbed_id;
  if not found then
    raise exception 'theme % not found', coalesce(p_absorbed_id, 'null');
  end if;

  select * into survivor from themes where id = p_survivor_id;
  if not found then
    raise exception 'theme % not found', coalesce(p_survivor_id, 'null');
  end if;

  if survivor.archived then
    raise exception 'theme % (%) is archived and cannot be the survivor of a merge',
      survivor.id, survivor.label;
  end if;

  -- Count first: after the move the absorbed side is empty by construction, so
  -- this is the only moment "how much moved" is readable.
  select count(*) into v_ideas  from idea_themes  where theme_id = absorbed.id;
  select count(*) into v_pieces from piece_themes where theme_id = absorbed.id;

  -- Move, then clear. `on conflict do nothing` IS the dedupe: an item carrying both
  -- Themes already has the survivor's row, so the insert skips it and the delete
  -- below removes the absorbed duplicate — the item ends with the survivor once.
  insert into idea_themes (idea_id, theme_id)
  select it.idea_id, survivor.id from idea_themes it where it.theme_id = absorbed.id
  on conflict do nothing;
  delete from idea_themes where theme_id = absorbed.id;

  insert into piece_themes (piece_id, theme_id)
  select pt.piece_id, survivor.id from piece_themes pt where pt.theme_id = absorbed.id
  on conflict do nothing;
  delete from piece_themes where theme_id = absorbed.id;

  -- Retire the absorbed label, keeping its row (reversible, honest history) and
  -- freeing the label under the partial unique index.
  update themes set archived = true where id = absorbed.id returning * into absorbed;

  return query select
    survivor.id, survivor.label,
    absorbed.id, absorbed.label,
    v_ideas, v_pieces;
end;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
-- Privileged verb: service_role only, never PUBLIC/anon (the semi-public anon key
-- must not reach it via raw PostgREST). Same pattern as the rest of the schema.
revoke execute on function merge_themes(text, text) from public;

grant execute on function merge_themes(text, text) to service_role;
