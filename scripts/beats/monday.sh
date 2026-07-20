#!/usr/bin/env bash
# Monday planning reminder — deterministic staleness reminder (ADR-0013): detect -> ping.
# Signal (an observable Supabase view, no state file): UNTRIAGED PROPOSALS — Pieces/Talks in
# state 'proposed' awaiting a pursue/decline (ADR-0014 dec.7; Ideas are a live pool, never
# "unjudged"). Any waiting -> nudge Davide to run /desk; none -> stay silent. It never judges
# or writes the Pipeline — the Desk does that live (docs/agents/monday-beat.md).
# Stages: monday.sh {detect|run}.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# detect — prints the reminder text when proposals await a decision, nothing (silent) otherwise.
detect() {
  local count
  count=$(supabase_get "untriaged_proposals?select=id" | jq 'length')
  if [ "${count:-0}" -eq 0 ]; then
    return 0   # nothing waiting — silence is the all-clear
  fi
  printf '%s\n' "🗓️ Time to plan — $count proposal(s) awaiting a pursue/decline. Run /desk to work them."
}

case "${1:-run}" in
  detect) detect ;;
  run)    beat_ping ;;
  *) echo "usage: monday.sh {detect|run}" >&2; exit 2 ;;
esac
