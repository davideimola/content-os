#!/usr/bin/env bash
# Thursday cadence guard — deterministic staleness reminder (ADR-0013): detect -> ping.
# Signal (observable, no state file): is this week's LinkedIn slot covered? Covered = a `linkedin`
# Piece published this week, OR one `slotted`/`in-production` dated today..Sunday. Not covered ->
# a FIXED nudge to run /desk or ship one; covered -> silent. It never names a specific proposal
# (the Desk picks live) and never writes labels or the board. Stages: thursday.sh {detect|run}.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# detect — prints the reminder text when the LinkedIn slot is open, nothing (silent) when covered.
detect() {
  reporoot
  local MON SUN TODAY pub sched
  read -r MON SUN TODAY <<<"$(week_bounds)"
  # published this week? (a linkedin Piece closed within Mon..Sun)
  pub=$(gh issue list --repo "$REPO" --state all --search "label:linkedin label:published" \
          --json closedAt \
          --jq "[.[] | select(.closedAt != null and (.closedAt[0:10]) >= \"$MON\" and (.closedAt[0:10]) <= \"$SUN\")] | length")
  # credibly scheduled for the rest of the week? (a linkedin board item, slotted/in-production, dated today..Sunday)
  sched=$(gh project item-list "$PROJECT" --owner "$OWNER" --query "label:linkedin" --format json -L 200 \
          | jq --arg from "$TODAY" --arg to "$SUN" \
              '[.items[] | select(.date != null and (.date[0:10]) >= $from and (.date[0:10]) <= $to
                 and ((.stage == "slotted") or (.stage == "in-production")))] | length')
  if [ "${pub:-0}" -gt 0 ] || [ "${sched:-0}" -gt 0 ]; then
    return 0   # covered — silence is the all-clear
  fi
  printf '%s\n' "📣 This week's LinkedIn slot is open → run /desk or ship one.
Board: https://github.com/users/$OWNER/projects/$PROJECT"
}

case "${1:-run}" in
  detect) detect ;;
  run)    beat_ping ;;
  *) echo "usage: thursday.sh {detect|run}" >&2; exit 2 ;;
esac
