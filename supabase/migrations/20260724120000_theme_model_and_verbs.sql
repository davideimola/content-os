-- ============================================================================
-- Deterministic theme model + tag Ideas by hand (#78, parent #75)
-- ============================================================================
-- Themes are a closed-but-extensible controlled vocabulary Davide assigns to
-- Ideas by hand in the console — a subject lens finer than the single Flag + few
-- Side buckets (#75), so he can spot "five Ideas on the same theme" before they
-- turn into five near-identical Pieces. They are DATA, not a Postgres enum:
-- minting a new one must not need a migration, and retiring one must not lose
-- history — so a theme lives in a table and is retired via an `archived` flag
-- (reversible, kept on record), never deleted. The Idea<->theme link is
-- many-to-many (an Idea carries 0..N themes; a theme groups many Ideas).
--
-- Assignment happens ONLY here, by hand (ADR-0008): never at capture, never
-- automatically/LLM (deferred, #75). The verbs mirror the established style
-- (atomic, security definer, service_role-only, grants at the foot); each is
-- wrapped by a Server Action (ADR-0016 — the UI writes only through the RPC
-- contract). MCP-adapter parity for these verbs is a later additive step.
-- ============================================================================

-- ── tables ───────────────────────────────────────────────────────────────────
create table themes (
  id         text primary key default gen_prefixed_id('theme'),
  label      text not null,
  archived   boolean not null default false,       -- retired: reversible, kept on record
  created_at timestamptz not null default now()
);

-- At most one LIVE theme per (case-insensitive) label — the DB-level guarantee
-- that the vocabulary can't split into near-duplicates, even under a concurrent
-- create_theme race. Partial (`where not archived`) so retiring a label frees it
-- to be minted afresh; the archived row stays on the record.
create unique index themes_live_label_uniq on themes (lower(label)) where not archived;

-- Idea <-> theme, many-to-many. Assignment is replace-all (set_idea_themes), so
-- no per-row lifecycle; a cascade keeps the join clean if either side is deleted.
create table idea_themes (
  idea_id  text not null references ideas(id)  on delete cascade,
  theme_id text not null references themes(id) on delete cascade,
  primary key (idea_id, theme_id)
);

-- ── verbs ─────────────────────────────────────────────────────────────────────
-- create_theme: mint a live theme, get-or-create by (case-insensitive) label so
-- minting the same label twice returns the existing one instead of erroring. A
-- label that only matches an ARCHIVED theme mints a fresh live one (the archived
-- row stays on the record). The get-or-create is the friendly happy path; the
-- `themes_live_label_uniq` partial index is the real dedup guarantee (it catches
-- the concurrent-race case the pre-check can't). Returns the live theme (created
-- or the pre-existing match).
create or replace function create_theme(p_label text)
returns themes
language plpgsql
security definer
set search_path = public
as $$
declare
  existing themes;
  created  themes;
  clean    text := btrim(coalesce(p_label, ''));
begin
  if length(clean) = 0 then
    raise exception 'label is required';
  end if;

  select * into existing from themes
   where not archived and lower(label) = lower(clean)
   limit 1;
  if found then
    return existing;
  end if;

  insert into themes (label) values (clean) returning * into created;
  return created;
end;
$$;

-- archive_theme: retire a theme (reversible — flips the flag, keeps the row and
-- any idea_themes links). Excluded from the live picker by the read layer, but an
-- Idea already tagged with it still resolves its label (honest history).
create or replace function archive_theme(p_id text)
returns themes
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_theme themes;
begin
  update themes set archived = true where id = p_id returning * into archived_theme;
  if not found then
    raise exception 'theme % not found', p_id;
  end if;
  return archived_theme;
end;
$$;

-- set_idea_themes: replace-all, idempotent. The Idea ends carrying EXACTLY the
-- given set — re-calling with a subset removes the rest, `{}` clears. Dedups the
-- input; the FK on theme_id aborts the tx on an unknown theme. Returns the
-- resulting rows so the caller can assert the set landed.
create or replace function set_idea_themes(p_idea_id text, p_theme_ids text[])
returns setof idea_themes
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from ideas where id = p_idea_id) then
    raise exception 'idea % not found', p_idea_id;
  end if;

  delete from idea_themes where idea_id = p_idea_id;

  insert into idea_themes (idea_id, theme_id)
  select distinct p_idea_id, t
  from unnest(coalesce(p_theme_ids, '{}'::text[])) as t;

  return query select * from idea_themes where idea_id = p_idea_id;
end;
$$;

-- ── RLS: deny-by-default, like the rest of the schema ─────────────────────────
alter table themes      enable row level security;
alter table idea_themes enable row level security;

-- ── grants ────────────────────────────────────────────────────────────────────
-- service_role reads the two tables directly — the console resolves an Idea's
-- themes and builds the live picker, the same way it reads piece_sources for
-- provenance (#76). No DML grant: the verbs are security definer.
grant select on themes, idea_themes to service_role;

-- Privileged verbs: service_role only, never PUBLIC/anon (the semi-public anon
-- key must not reach them via raw PostgREST).
revoke execute on function
  create_theme(text),
  archive_theme(text),
  set_idea_themes(text, text[])
from public;

grant execute on function
  create_theme(text),
  archive_theme(text),
  set_idea_themes(text, text[])
to service_role;
