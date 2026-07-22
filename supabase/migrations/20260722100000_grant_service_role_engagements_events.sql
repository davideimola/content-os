-- ============================================================================
-- Grant service_role SELECT on engagements + events
-- ============================================================================
-- The Fase-4 grant migration (20260719002216) gave service_role SELECT on only
-- ideas / pieces / talks + the untriaged_proposals view — the tables the MCP read
-- *tools* touch. But the web console reads the **Calendar** directly
-- (`getCalendarItems`, ADR-0016): CFP deadlines from `engagements` and conference
-- dates from `events`. On a locked-down DB those reads were denied
-- ("permission denied for table engagements"), surfaced during ADR-0019
-- verification against a fresh local Supabase. Both tables keep RLS (anon still
-- reaches events only through the `public_events` view); this adds the least the
-- console needs — SELECT for the trusted backend, nothing more.
-- ============================================================================

grant select on engagements, events to service_role;
