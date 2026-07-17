#!/usr/bin/env bash
# Thursday cadence guard Beat — separated runner (ADR-0003). Guards the week's LinkedIn slot:
#   GATHER (gh) -> DECIDE (Gemini) -> APPLY (at most one Telegram ping, or nothing).
# It never changes labels or the board (Monday plans; Thursday only guards). Judgement lives in
# docs/agents/thursday-beat.md. Stages: thursday.sh {gather|decide <s>|apply <d>|run}.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
BEAT_DOC="docs/agents/thursday-beat.md"

gather() {
  reporoot
  local MON SUN TODAY pub_li board_li candidates ideas
  read -r MON SUN TODAY <<<"$(week_bounds)"
  pub_li=$(gh issue list --repo "$REPO" --state all --search "label:linkedin label:published" \
            --json number,title,closedAt --jq '[.[] | {number, title, closedAt}]')
  board_li=$(gh project item-list "$PROJECT" --owner "$OWNER" --query "label:linkedin" --format json -L 200 \
            --jq '[.items[] | {number: .content.number, title: .content.title, date:(.date[0:10]), stage}]')
  candidates=$(gh issue list --repo "$REPO" --state open --search "label:linkedin" \
            --json number,title,labels --jq '[.[] | {number, title, labels:[.labels[].name]}]')
  ideas=$(gh issue list --repo "$REPO" --state open --label idea \
            --json number,title --jq '[.[] | {number, title}]')
  jq -n --arg mon "$MON" --arg sun "$SUN" --arg today "$TODAY" \
        --argjson published_linkedin "$pub_li" --argjson board_linkedin "$board_li" \
        --argjson linkedin_candidates "$candidates" --argjson ideas "$ideas" \
    '{week:{monday:$mon, sunday:$sun, today:$today},
      published_linkedin:$published_linkedin, board_linkedin:$board_linkedin,
      linkedin_candidates:$linkedin_candidates, ideas:$ideas}'
}

decision_schema() {
  cat <<'JSON'
{"type":"object","properties":{
  "on_track":{"type":"boolean"},
  "ping":{"type":"string"}},
  "required":["on_track","ping"]}
JSON
}

decide() {   # $1 = state json file
  reporoot
  local state prompt; state=$(cat "${1:--}")
  prompt=$(cat <<EOF
$(cat "$BEAT_DOC")

---
You are executing the Thursday cadence guard above, but you do NOT run any tools. Given the current
state JSON, return ONLY a decision object (matching the schema): decide whether this week's LinkedIn
slot is covered (published this week, or a linkedin piece slotted/in-production dated today..Sunday —
a slotted date already passed without publishing counts as NOT covered). If ON TRACK set on_track=true
and ping="" (silence is the all-clear). If AT RISK set on_track=false and write ONE rescue ping naming
the single most-ready linkedin proposal + the single next action + its link
(https://github.com/$REPO/issues/<n>). Reference only issue numbers present in the state. Never draft
content. Today is the state's week.today.

CURRENT STATE:
$state
EOF
)
  gemini_decide "$prompt" "$(decision_schema)"
}

apply() {   # $1 = decisions json file — Thursday only ever sends (or withholds) one ping
  reporoot
  local d ping; d=$(cat "${1:--}")
  if [ "$(echo "$d" | jq -r '.on_track')" = "true" ]; then
    echo "on track — no ping"; return 0
  fi
  ping=$(echo "$d" | jq -r '.ping // empty')
  notify_ping "$ping"
}

case "${1:-run}" in
  gather) gather ;;
  decide) decide "${2:--}" ;;
  apply)  apply  "${2:--}" ;;
  run)    tmp_s=$(mktemp) tmp_d=$(mktemp)
          gather >"$tmp_s"; decide "$tmp_s" >"$tmp_d"; apply "$tmp_d"; rm -f "$tmp_s" "$tmp_d" ;;
  *) echo "usage: thursday.sh {gather|decide <state>|apply <decisions>|run}" >&2; exit 2 ;;
esac
