#!/usr/bin/env bash
# Monthly review reminder — deterministic staleness reminder (ADR-0013): detect -> ping.
# Signal (observable, no state file): is last month's metrics/<YYYY-MM>/ present? Missing ->
# nudge Davide to import the metrics and run /review; present -> silent. The analysis itself is
# the interactive Review's job (docs/agents/monthly-beat.md). Stages: monthly.sh {detect|run}.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

prev_month() {   # YYYY-MM of the just-ended month
  date -d "$(date +%Y-%m-01) -1 day" +%Y-%m 2>/dev/null || date -v1d -v-1m +%Y-%m
}

# detect — prints the reminder text when last month's metrics dir is missing, nothing otherwise.
detect() {
  reporoot
  local month
  month=$(prev_month)
  if [ -d "metrics/$month" ]; then
    return 0   # metrics already imported — silence
  fi
  printf '%s\n' "📊 Monthly review is due — metrics/$month/ is missing.
Import last month's metrics and run /review."
}

case "${1:-run}" in
  detect) detect ;;
  run)    beat_ping ;;
  *) echo "usage: monthly.sh {detect|run}" >&2; exit 2 ;;
esac
