-- ============================================================================
-- Free-text edit verbs — the console's "edit contents" hands (ADR-0016)
-- ============================================================================
-- The write contract (ADR-0015) had no way to change free text: an Idea's body
-- or an output's title. The console (content-os-web) needs it, and per ADR-0016
-- the UI writes ONLY through RPC verbs — so editing text is a contract change,
-- not a UI-only one. These mirror the existing verb style: atomic, security
-- definer, service_role-only (never PUBLIC/anon, which would expose them via the
-- semi-public anon key). `updated_at` bumps via the existing triggers.
--
-- MCP-adapter parity (so the Desk/AI apps can edit too) is a later, additive
-- step; this migration establishes the verbs on the contract.
-- ============================================================================

-- ── edit_idea: the summary title (optional) + the verbatim body (required) ────
create or replace function edit_idea(p_id text, p_title text, p_body text)
returns ideas
language plpgsql
security definer
set search_path = public
as $$
declare
  updated ideas;
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'body is required';
  end if;

  update ideas
     set title = nullif(btrim(coalesce(p_title, '')), ''),
         body  = p_body
   where id = p_id
  returning * into updated;

  if not found then
    raise exception 'idea % not found', p_id;
  end if;

  return updated;
end;
$$;

-- ── edit_piece: rename a Piece (title required) ──────────────────────────────
create or replace function edit_piece(p_id text, p_title text)
returns pieces
language plpgsql
security definer
set search_path = public
as $$
declare
  updated pieces;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title is required';
  end if;

  update pieces
     set title = btrim(p_title)
   where id = p_id
  returning * into updated;

  if not found then
    raise exception 'piece % not found', p_id;
  end if;

  return updated;
end;
$$;

-- ── edit_talk: rename a Talk (title required) ────────────────────────────────
create or replace function edit_talk(p_id text, p_title text)
returns talks
language plpgsql
security definer
set search_path = public
as $$
declare
  updated talks;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title is required';
  end if;

  update talks
     set title = btrim(p_title)
   where id = p_id
  returning * into updated;

  if not found then
    raise exception 'talk % not found', p_id;
  end if;

  return updated;
end;
$$;

-- ── grants: service_role only (same lockdown as the other privileged verbs) ───
revoke execute on function
  edit_idea(text, text, text),
  edit_piece(text, text),
  edit_talk(text, text)
from public;

grant execute on function
  edit_idea(text, text, text),
  edit_piece(text, text),
  edit_talk(text, text)
to service_role;
