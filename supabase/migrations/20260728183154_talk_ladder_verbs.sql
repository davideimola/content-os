-- ============================================================================
-- Verbs for the Talk ladder: start production, mark ready (#115)
-- ============================================================================
-- `talk_state` has four values and the contract reached two: `spawn_talk` inserts
-- at `proposed`, `decline_talk` declines, `edit_talk` renames — and **nothing**
-- could set `in_production` or `ready`. The ladder could not be climbed at all,
-- which is why all three live Talks read `ready`: that value was written by hand
-- at migration time, and Davide's own account is that none of them is prepared.
-- Correcting the rows alone would leave them lying again the moment the slides are
-- actually finished, because nothing could record it.
--
-- Two verbs, **named after what they do** rather than one generic setter. The
-- Pipeline's style is `slot_piece` / `mark_ready` / `publish_piece`; a
-- `set_talk_state(id, state)` would hand every client the whole enum and invite one
-- to drift from the contract — the transition, not the value, is the fact worth
-- recording. The ladder they encode:
--
--   proposed      → start_talk_production → in_production
--   in_production → mark_talk_ready       → ready
--   ready         → start_talk_production → in_production   (slides reopened)
--
-- Each verb is FROM-state guarded and raises off anything else, exactly as
-- `mark_ready` raises off a Piece that is not `slotted`
-- (20260721170000_ready_state_and_mark_ready.sql) — missing and wrong-state are
-- distinguished so the caller gets a reason rather than a silent no-op. The
-- deferred-guard rule from the ops slice is satisfied rather than broken: with both
-- rungs reachable in the same slice, every illegal source state can actually occur.
--
-- `declined` is deliberately NOT a legal source for either verb: it stays reachable
-- only through `decline_talk`. Two consequences are contract gaps reported with
-- #115 rather than quietly widened here — a Talk declined by mistake is stuck (the
-- Talk ladder has no `deslot_piece`-shaped way back down), and nothing returns a
-- Talk to `proposed`. The second is not an oversight to fix in passing: `proposed`
-- is what `untriaged_proposals` counts, so a verb that put a Talk back there would
-- put it back in front of the Monday Beat.
--
-- ADR-0017 dec.5 held these back — "the Talk ladder … get **no** verb here —
-- nothing consumes them yet … Add them when a consumer appears". That condition is
-- met, not overridden: the console's Talks rework (#119) taps both rungs, and the
-- data repair below needs the verb today. This is the deferred-guard rule paying
-- out, not an amendment to that ADR.
--
-- **The data repair is not a statement in this migration**, deliberately. The three
-- live Talks (`talk_…066` ComeToCode, `talk_…067` GoLab, `talk_…068` reactjsday)
-- were moved `ready → in_production` by calling `start_talk_production` on the live
-- project once this migration was applied — the ticket's own condition, "through the
-- new verbs, not with a raw UPDATE". A targeted statement here could not do the job:
-- those rows exist in exactly one database (they were hand-seeded, like the
-- Engagements #114 found), so on any fresh DB the ids resolve to nothing, and on the
-- live one the migration is already recorded as applied. A statement that can never
-- run is a worse record than this note.
--
-- Evidence the repair rests on, per Talk: each has an `accepted` `cfp` Engagement, so
-- each was judged, pursued, submitted and won a slot — which is what rules out
-- `proposed`, the state `untriaged_proposals` counts and the Monday Beat pings on.
-- Each has a `brief_url` into the presentations Factory; two have a half-built deck
-- there (`ai-defense/src/slides.md`, `securing-go/src/slides.md`) and `…068` has no
-- deck folder at all ("Slidev folder: TBD"). None is finished, so none is `ready`.
-- The residual, recorded rather than papered over: for `…068` this ladder has no rung
-- for "accepted, deck not begun", and `in_production` overstates it by exactly that
-- much. `in_production` is the least-wrong state it can be justified in, and it was
-- not reached by redefining what the state means.
--
-- Style is the established one: atomic, `security definer`, `set search_path =
-- public`, service_role-only grants at the foot, `updated_at` via the existing
-- trigger. Verbs contracted in docs/design/supabase-foundations.md (RPC verbs).
-- MCP-adapter parity is a later, additive step, as it was for the edit, theme and
-- Engagement verbs.
-- ============================================================================

-- ── start_talk_production: the deck is being built ────────────────────────────
-- Two legal sources, and the second is the point: a `ready` Talk goes back into
-- production when the slides are reopened — a talk is re-cut for another
-- conference, a demo is rebuilt, a section is rewritten. That is not an error to
-- guard against, it is the normal life of a reusable asset (one Talk → many
-- Engagements), so it shares this verb rather than earning a `reopen_talk` of its
-- own: the fact recorded afterwards is the same either way.
create or replace function start_talk_production(p_id text)
returns talks
language plpgsql
security definer
set search_path = public
as $$
declare
  started talks;
begin
  update talks
     set state = 'in_production'
   where id = p_id and state in ('proposed', 'ready')
  returning * into started;

  if not found then
    -- Distinguish missing from wrong-state so the caller gets a clear reason.
    if not exists (select 1 from talks where id = p_id) then
      raise exception 'talk % not found', p_id;
    end if;
    raise exception 'talk % must be proposed or ready to start production', p_id;
  end if;

  return started;
end;
$$;

-- ── mark_talk_ready: the slides are finished ──────────────────────────────────
-- The twin of the Piece's `mark_ready`, and the same milestone: prepared, in the
-- can. Only from `in_production` — a Talk cannot jump from `proposed` to `ready`,
-- because `ready` is a claim about work that was done and `proposed` is a claim
-- that none has been. (`publish_piece` may skip a Piece's `ready` for the opposite
-- reason: a Piece written and shipped the same day still passed through being
-- written, and the publish date is the fact. A deck has no such shortcut.)
create or replace function mark_talk_ready(p_id text)
returns talks
language plpgsql
security definer
set search_path = public
as $$
declare
  readied talks;
begin
  update talks
     set state = 'ready'
   where id = p_id and state = 'in_production'
  returning * into readied;

  if not found then
    if not exists (select 1 from talks where id = p_id) then
      raise exception 'talk % not found', p_id;
    end if;
    raise exception 'talk % must be in production to mark ready', p_id;
  end if;

  return readied;
end;
$$;

-- ── grants: privileged verbs, service_role only ───────────────────────────────
-- Never PUBLIC/anon (the semi-public anon key must not reach them via raw
-- PostgREST). service_role already has SELECT on `talks`
-- (20260719002216_grant_service_role_table_access.sql); no DML grant is added,
-- because the writes go through these definer functions.
revoke execute on function
  start_talk_production(text),
  mark_talk_ready(text)
from public;

grant execute on function
  start_talk_production(text),
  mark_talk_ready(text)
to service_role;
