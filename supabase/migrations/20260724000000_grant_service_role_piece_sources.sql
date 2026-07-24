-- ============================================================================
-- Grant service_role SELECT on piece_sources
-- ============================================================================
-- The Fase-4 grant migration (20260719002216) gave service_role SELECT on only
-- ideas / pieces / talks + the untriaged_proposals view — the tables the MCP read
-- *tools* touch. Issue #76 makes an Idea's **provenance** visible on the Ideas
-- view: the console reads back the `piece_sources` join directly
-- (`getIdeasWithProvenance`, ADR-0016) to count and list the Pieces an Idea
-- spawned. On a locked-down DB that read is denied ("permission denied for table
-- piece_sources"), since service_role has BYPASSRLS but no table grant. This adds
-- the least the console needs — SELECT for the trusted backend, nothing more; the
-- table keeps RLS and anon stays locked out. No verb/contract change (read-only).
-- ============================================================================

grant select on piece_sources to service_role;
