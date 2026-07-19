-- ============================================================================
-- Fase-4 write verbs — the Desk's remaining Idea + Piece hands (ADR-0015)
-- ============================================================================
-- archive_idea (pool dedup / repudiation), block_piece (the blog->linkedin
-- amplifier dependency), set_piece_artifact (the Factory draft pointer). Same
-- pattern as the earlier verbs: atomic, security definer, service_role only
-- (grants at the foot). `updated_at` bumps via the existing triggers.
-- ============================================================================

-- ── archive_idea: reversibly archive an Idea (duplicate / repudiated) ─────────
create or replace function archive_idea(
  p_id           text,
  p_reason       text,
  p_duplicate_of text default null
)
returns ideas
language plpgsql
security definer
set search_path = public
as $$
declare
  archived ideas;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'reason is required to archive an idea';
  end if;

  update ideas
     set status = 'archived', archived_reason = p_reason, duplicate_of = p_duplicate_of
   where id = p_id
  returning * into archived;

  if not found then
    raise exception 'idea % not found', p_id;
  end if;

  return archived;
end;
$$;

-- ── block_piece: one Piece blocks another (e.g. blog blocks its LinkedIn) ─────
create or replace function block_piece(p_blocked_id text, p_blocker_id text)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  blocked pieces;
begin
  if p_blocked_id = p_blocker_id then
    raise exception 'a piece cannot block itself';
  end if;

  -- The FK on blocked_by_piece_id makes a non-existent blocker abort the tx.
  update pieces
     set blocked_by_piece_id = p_blocker_id
   where id = p_blocked_id
  returning * into blocked;

  if not found then
    raise exception 'piece % not found', p_blocked_id;
  end if;

  return blocked;
end;
$$;

-- ── set_piece_artifact: point a Piece at its Factory draft (PR / MDX) ─────────
create or replace function set_piece_artifact(p_id text, p_url text)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  updated pieces;
begin
  if p_url is null or length(btrim(p_url)) = 0 then
    raise exception 'url is required';
  end if;

  update pieces
     set artifact_url = p_url
   where id = p_id
  returning * into updated;

  if not found then
    raise exception 'piece % not found', p_id;
  end if;

  return updated;
end;
$$;

-- ── privileged verbs: service_role only, never PUBLIC/anon ───────────────────
revoke execute on function
  archive_idea(text, text, text),
  block_piece(text, text),
  set_piece_artifact(text, text)
from public;

grant execute on function
  archive_idea(text, text, text),
  block_piece(text, text),
  set_piece_artifact(text, text)
to service_role;
