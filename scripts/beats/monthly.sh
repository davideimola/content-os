#!/usr/bin/env bash
# Monthly review reminder — deterministic staleness reminder (ADR-0013): detect -> ping.
# Signal (an observable Supabase read, no state file): are last month's metrics in the DB?
# Metrics moved into the DB (ADR-0014/0015 — no more committed metrics/<YYYY-MM>/ files), so
# the marker is a `metrics_site` row for last month (the Review always records the site numbers).
# Missing -> nudge Davide to import the metrics and run /review; present -> silent. The analysis
# itself is the interactive Review's job (docs/agents/monthly-beat.md). Stages: monthly.sh {detect|run}.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

prev_month() {   # YYYY-MM of the just-ended month
  date -d "$(date +%Y-%m-01) -1 day" +%Y-%m 2>/dev/null || date -v1d -v-1m +%Y-%m
}

# detect — prints the reminder text when last month's site metrics are absent, nothing otherwise.
detect() {
  local month count
  month=$(prev_month)                       # YYYY-MM
  # metrics_site.month is a date pinned to the first of the month (see the init migration).
  count=$(supabase_get "metrics_site?month=eq.${month}-01&select=id" | jq 'length')
  if [ "${count:-0}" -gt 0 ]; then
    return 0   # metrics already imported — silence
  fi
  printf '%s\n' "📊 Monthly review is due — no metrics for $month yet.
Import last month's metrics and run /review."
}

case "${1:-run}" in
  detect) detect ;;
  run)    beat_ping ;;
  *) echo "usage: monthly.sh {detect|run}" >&2; exit 2 ;;
esac
