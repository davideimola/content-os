#!/usr/bin/env bash
# Monday planning reminder — deterministic staleness reminder (ADR-0013): detect -> ping.
# Signal (observable, no state file): open UNJUDGED Ideas (`idea` + open + 0 child Pieces).
# Any waiting -> nudge Davide to run /desk; none -> stay silent. It never judges or writes
# the Pipeline — the Desk does that live (docs/agents/monday-beat.md). Stages: monday.sh {detect|run}.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# detect — prints the reminder text when unjudged Ideas are waiting, nothing (silent) otherwise.
# Counts inline (not via lib.sh read_pipeline, which also fetches the board/Pieces this Beat doesn't need).
detect() {
  reporoot
  local ideas count i num kids unjudged=0
  ideas=$(gh issue list --repo "$REPO" --label idea --state open --json number)
  count=$(jq 'length' <<<"$ideas")
  i=0
  while [ "$i" -lt "$count" ]; do
    num=$(jq -r ".[$i].number" <<<"$ideas")
    kids=$(gh api "repos/$REPO/issues/$num/sub_issues" --jq 'length' 2>/dev/null || echo 0)
    [ "$kids" -eq 0 ] && unjudged=$((unjudged+1))
    i=$((i+1))
  done
  if [ "$unjudged" -eq 0 ]; then
    return 0   # inbox clear — silence is the all-clear
  fi
  printf '%s\n' "🗓️ Time to plan — $unjudged unjudged idea(s) waiting. Run /desk to work the week.
Board: https://github.com/users/$OWNER/projects/$PROJECT"
}

case "${1:-run}" in
  detect) detect ;;
  run)    beat_ping ;;
  *) echo "usage: monday.sh {detect|run}" >&2; exit 2 ;;
esac
