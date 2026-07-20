#!/usr/bin/env bash
# Thursday cadence guard — deterministic staleness reminder (ADR-0013): detect -> ping.
# Signal (an observable Supabase view, no state file): is this week's LinkedIn slot covered?
# The `cadence_status` view computes it server-side (a `linkedin` Piece published since the
# start of this week, OR one slotted/in_production dated today..Sunday). Covered -> silent;
# open -> a FIXED nudge to run /desk or ship one. It never names a specific proposal (the Desk
# picks live) and never writes the Pipeline. Stages: thursday.sh {detect|run}.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# detect — prints the reminder text when the LinkedIn slot is open, nothing (silent) when covered.
detect() {
  local covered
  covered=$(supabase_get "cadence_status?select=linkedin_week_covered" | jq -r '.[0].linkedin_week_covered')
  if [ "$covered" = "true" ]; then
    return 0   # covered — silence is the all-clear
  fi
  printf '%s\n' "📣 This week's LinkedIn slot is open → run /desk or ship one."
}

case "${1:-run}" in
  detect) detect ;;
  run)    beat_ping ;;
  *) echo "usage: thursday.sh {detect|run}" >&2; exit 2 ;;
esac
