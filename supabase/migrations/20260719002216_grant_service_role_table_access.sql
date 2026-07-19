-- ============================================================================
-- Grant the trusted backend (service_role) the LEAST access it needs; lock the
-- privileged verbs to it (ADR-0015)
-- ============================================================================
-- The content-os MCP adapter talks to the DB as service_role (which has
-- BYPASSRLS). In this project service_role had only REFERENCES/TRIGGER/TRUNCATE
-- on the base tables, so its direct reads were denied.
--
-- Least-privilege (ADR-0015 dec.3 — "only the verbs, nothing else"): the write
-- verbs are `security definer`, so they run as the function owner and need NO
-- table DML from the caller. service_role therefore needs only SELECT, and only
-- on what the read tools touch (ideas, pieces, talks + the untriaged_proposals
-- view). No INSERT/UPDATE/DELETE and no blanket default privileges — a leaked
-- service_role key can then read the Pipeline but not bypass the atomic verbs
-- with raw DML. anon stays locked out (RLS + no grants; only public_events +
-- capture_idea ever reach it).
-- ============================================================================

-- ── service_role: SELECT on exactly what the read tools list ─────────────────
grant usage on schema public to service_role;
grant select on ideas, pieces, talks to service_role;
grant select on untriaged_proposals to service_role;

-- ── privileged verbs: service_role only, never PUBLIC/anon ───────────────────
-- A fresh function defaults to EXECUTE for PUBLIC, which — with the semi-public
-- anon key (davideimola.dev uses it) — would let anyone call these via raw
-- PostgREST. Revoke that; grant only to service_role. capture_idea stays anon's.
revoke execute on function
  spawn_piece(piece_channel, flag_side, text, text[]),
  slot_piece(text, date),
  deslot_piece(text),
  decline_piece(text),
  spawn_talk(flag_side, text, text[]),
  decline_talk(text)
from public;

grant execute on function
  spawn_piece(piece_channel, flag_side, text, text[]),
  slot_piece(text, date),
  deslot_piece(text),
  decline_piece(text),
  spawn_talk(flag_side, text, text[]),
  decline_talk(text)
to service_role;
