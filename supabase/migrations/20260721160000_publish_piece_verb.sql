-- ============================================================================
-- publish_piece — the first lifecycle-advance verb (ADR-0017)
-- ============================================================================
-- The Fase-4 ops slice (ADR-0015) stopped at `slotted`: no verb advanced a Piece
-- past it, and that migration deliberately left slot/deslot/decline unguarded
-- "while no verb reaches published; add transition guards when the advance verbs
-- land, not before." This is that moment. The monthly Review (/review) computes
-- the realized Flag/Side mix + Cadence over the month's PUBLISHED Pieces — with no
-- way to mark a Piece published it would see zero. Content-os writes only through
-- the contract (ADR-0015/0016), so this is a contract change, not a UI-only one.
--
-- Called by the console (content-os-web "Mark shipped"), a direct RPC client — not
-- the Desk (which stays pre-publish) and not, for now, the MCP adapter (no MCP
-- consumer publishes; the tool is additive-later, YAGNI). Scope stops at
-- `published`: `in_production` and the Talk ladder get no verb until a consumer
-- needs them (same rule the deferred guards followed).
-- ============================================================================

-- ── publish_piece: a shipped Piece goes live (slotted -> published) ───────────
-- The first FROM-state guarded verb: a Piece is published only from `slotted`,
-- keeping the calendar publish_date the Review reads. The guard the base ops
-- migration deferred lands here, with the verb that first makes `published`
-- reachable — not retrofitted onto verbs whose target states still cannot occur.
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
   where id = p_id and state = 'slotted'
  returning * into published;

  if not found then
    -- Distinguish missing from wrong-state so the caller gets a clear reason.
    if not exists (select 1 from pieces where id = p_id) then
      raise exception 'piece % not found', p_id;
    end if;
    raise exception 'piece % must be slotted to publish', p_id;
  end if;

  return published;
end;
$$;

-- ── grant: service_role only (same lockdown as the other privileged verbs) ────
revoke execute on function publish_piece(text) from public;
grant  execute on function publish_piece(text) to service_role;
