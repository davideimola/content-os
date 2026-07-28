-- ============================================================================
-- Verbs for the Engagement tier: create an Event, submit a Talk, record an
-- outcome (#114)
-- ============================================================================
-- `events` and `engagements` have existed since the init migration and no verb
-- has ever touched them. The three live Engagements were seeded by hand and all
-- three carry `deadline: null` — which is exactly why none of them appears on
-- the Calendar, whose CFP read is `kind = 'cfp' and deadline is not null` — and
-- the Desk explicitly does not run this tier. A modelled tier the contract
-- cannot write is nobody's job; these three verbs make it reachable. The surface
-- that calls them lands with the Talks rework (#119); this is the contract.
--
-- One rule shapes all three: a verb **validates** the invariant the schema
-- already carries, it never bypasses it. `engagement_outcome_matches_kind`
-- constrains the outcome by kind (`cfp` → to_submit / submitted / accepted /
-- rejected; `direct` → confirmed). The check stays the backstop underneath, and
-- each verb refuses the illegal combination first, with a legible message —
-- a caller deserves "outcome confirmed is not valid for a cfp engagement", not a
-- constraint name. That is the whole point of routing writes through verbs: no
-- client can drift from the contract.
--
-- Style is the established one (Fase-4 ops slice): atomic, `security definer`,
-- `set search_path = public`, service_role-only grants at the foot, ids from
-- `gen_prefixed_id` (`event_…` / `eng_…`), `updated_at` via the existing triggers.
-- Verbs contracted in docs/design/supabase-foundations.md (RPC verbs).
-- MCP-adapter parity (so the Desk/AI apps could run the tier too) is a later,
-- additive step, as it was for the edit and theme verbs.
-- ============================================================================

-- ── create_event: a conference exists before anything is submitted to it ──────
-- Only the name is required: a CFP is often answered months before the dates or
-- the venue are announced, and an Event with no `starts_on` simply carries no
-- Calendar row until it has one.
--
-- NOT get-or-create by name, unlike `create_theme`: a theme's label IS its
-- identity, while two Events can legitimately share a name (the same conference,
-- another year), so folding them together would silently hand back an Event with
-- the wrong dates. Choosing an existing Event instead of minting a duplicate is
-- the picker's job in the UI; the DB does not guess.
--
-- `roles` are the roles Davide holds at the Event (organizer, mc, …) — speaking
-- is not one of them: it is *derived* from an accepted engagement (init
-- migration). Blank entries are dropped and the set deduped, so
-- `{organizer, organizer, ''}` lands as `{organizer}`; `array_agg(distinct …)`
-- also makes the stored order deterministic rather than whatever order the
-- caller happened to type.
--
-- `is_public` is deliberately NOT a parameter: it governs the public read surface
-- on davideimola.dev (the `public_events` view), and putting an Event on the
-- website is a different act from recording that it exists. It keeps its column
-- default (false) and earns its own verb when a surface asks for one.
create or replace function create_event(
  p_name      text,
  p_starts_on date default null,
  p_ends_on   date default null,
  p_location  text default null,
  p_url       text default null,
  p_roles     text[] default '{}'
)
returns events
language plpgsql
security definer
set search_path = public
as $$
declare
  new_event events;
  v_roles   text[];
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'name is required';
  end if;

  select coalesce(array_agg(distinct btrim(r)), '{}'::text[])
    into v_roles
    from unnest(coalesce(p_roles, '{}'::text[])) as r
   where length(btrim(r)) > 0;

  insert into events (name, starts_on, ends_on, location, url, roles)
  values (
    btrim(p_name),
    p_starts_on,
    p_ends_on,
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(p_url, '')), ''),
    v_roles
  )
  returning * into new_event;

  return new_event;
end;
$$;

-- ── create_engagement: one submission of one Talk to one Event ────────────────
-- One Talk → many Engagements (one per conference), so this is a plain insert and
-- not an upsert: taking the same Talk to a second Event is the normal case, and
-- there is no unique key over (talk, event) to fold onto.
--
-- Both parents are checked explicitly rather than left to the FKs, so a caller
-- passing a stale id reads 'talk … not found' instead of a foreign-key violation
-- naming a constraint. The FKs stay the backstop.
--
-- The outcome is NOT a parameter. Like `spawn_piece` inserting at `proposed`, a
-- submission is born at the bottom of its ladder and moves through
-- `set_engagement_outcome`. Which bottom depends on the kind, and that is the
-- check constraint's rule read here rather than restated as prose:
--   cfp    → 'to_submit'  (an answer to write and send)
--   direct → 'confirmed'  (an invitation has nothing to await)
--
-- `kind` defaults to 'cfp' — the only kind any live row has, and the only one the
-- console creates — while staying passable, so the contract does not make
-- `direct` unreachable for a tier the table already models. `deadline` and
-- `cfp_link` are cfp-only *by convention* (a comment on the columns, not a check),
-- and the verb does NOT police that: it would be a rule the schema does not carry,
-- and an invited speaker is sometimes still handed a link to file an abstract
-- through. The one thing guarded here is the outcome, because that one IS a check.
create or replace function create_engagement(
  p_talk_id  text,
  p_event_id text,
  p_kind     engagement_kind default 'cfp',
  p_deadline date default null,
  p_cfp_link text default null
)
returns engagements
language plpgsql
security definer
set search_path = public
as $$
declare
  new_engagement engagements;
  v_kind         engagement_kind := coalesce(p_kind, 'cfp');
  v_cfp_link     text := nullif(btrim(coalesce(p_cfp_link, '')), '');
begin
  if not exists (select 1 from talks where id = p_talk_id) then
    raise exception 'talk % not found', p_talk_id;
  end if;

  if not exists (select 1 from events where id = p_event_id) then
    raise exception 'event % not found', p_event_id;
  end if;

  insert into engagements (talk_id, event_id, kind, outcome, deadline, cfp_link)
  values (
    p_talk_id,
    p_event_id,
    v_kind,
    case v_kind
      when 'direct' then 'confirmed'::engagement_outcome
      else 'to_submit'::engagement_outcome
    end,
    p_deadline,
    v_cfp_link
  )
  returning * into new_engagement;

  return new_engagement;
end;
$$;

-- ── set_engagement_outcome: record where a submission stands ──────────────────
-- The outcome is the fact Davide keeps instead of remembering: to_submit →
-- submitted → accepted / rejected.
--
-- No transition guard, deliberately, and this is where it differs from the Piece
-- lifecycle: `mark_ready` records something Davide himself did once, so a wrong
-- source state is a bug; an outcome records a decision made *outside* the system,
-- so a mis-tapped 'rejected' has to be repairable and a conference moving a talk
-- off its waitlist is not a contract violation. What IS guarded is the kind,
-- because that is the schema's own rule — the deferred-guard rule from the ops
-- slice: guard what can actually go wrong, not what merely could be ordered.
create or replace function set_engagement_outcome(p_id text, p_outcome engagement_outcome)
returns engagements
language plpgsql
security definer
set search_path = public
as $$
declare
  updated engagements;
  v_kind  engagement_kind;
begin
  if p_outcome is null then
    raise exception 'outcome is required';
  end if;

  select kind into v_kind from engagements where id = p_id;
  if not found then
    raise exception 'engagement % not found', p_id;
  end if;

  -- The same rule as engagement_outcome_matches_kind, refused here with a reason
  -- a caller can read; the constraint remains underneath as the backstop.
  if (v_kind = 'cfp'    and p_outcome not in ('to_submit', 'submitted', 'accepted', 'rejected'))
  or (v_kind = 'direct' and p_outcome <> 'confirmed') then
    raise exception 'outcome % is not valid for a % engagement', p_outcome, v_kind;
  end if;

  update engagements
     set outcome = p_outcome
   where id = p_id
  returning * into updated;

  return updated;
end;
$$;

-- ── grants: privileged verbs, service_role only ───────────────────────────────
-- Never PUBLIC/anon (the semi-public anon key must not reach them via raw
-- PostgREST). service_role already has SELECT on both tables
-- (20260722100000_grant_service_role_engagements_events.sql, for the Calendar's
-- read); no DML grant is added, because the writes go through these definer
-- functions.
revoke execute on function
  create_event(text, date, date, text, text, text[]),
  create_engagement(text, text, engagement_kind, date, text),
  set_engagement_outcome(text, engagement_outcome)
from public;

grant execute on function
  create_event(text, date, date, text, text, text[]),
  create_engagement(text, text, engagement_kind, date, text),
  set_engagement_outcome(text, engagement_outcome)
to service_role;
