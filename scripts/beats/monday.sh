#!/usr/bin/env bash
# Monday planning Beat — separated runner (ADR-0003 hands/brain).
#   GATHER (gh) -> DECIDE (one Gemini REST call, JSON mode, non-agentic) -> APPLY (gh + contentos).
# The editorial judgement lives in docs/agents/monday-beat.md; this feeds it to the model and only
# executes the JSON returned. Stages runnable standalone: monday.sh {gather|decide <s>|apply <d>|run}.
# See docs/agents/beat-scheduling.md. Env: GEMINI_API_KEY, GH_TOKEN (repo+project+read:org), TELEGRAM_*.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
BEAT_DOC="docs/agents/monday-beat.md"

gather() {
  reporoot
  local MON SUN TODAY ideas inflight published board
  read -r MON SUN TODAY <<<"$(week_bounds)"
  ideas=$(gh issue list --repo "$REPO" --label idea --state open \
            --json number,title,body --jq '[.[] | {number, title, body}]')
  inflight=$(gh issue list --repo "$REPO" --state open \
            --search "label:proposed,slotted,in-production" \
            --json number,title,labels --jq '[.[] | {number, title, labels:[.labels[].name]}]')
  published=$(gh issue list --repo "$REPO" --state all --label published --limit 30 \
            --json number,title --jq '[.[] | {number, title}]')
  board=$(gh project item-list "$PROJECT" --owner "$OWNER" --format json -L 200 \
            --jq '[.items[] | {number: .content.number, title: .content.title, date: (.date[0:10]), stage}]')
  jq -n --arg mon "$MON" --arg sun "$SUN" --arg today "$TODAY" \
        --argjson ideas "$ideas" --argjson inflight "$inflight" \
        --argjson published "$published" --argjson board "$board" \
    '{week:{monday:$mon, sunday:$sun, today:$today}, ideas:$ideas, inflight:$inflight, published:$published, board:$board}'
}

decision_schema() {
  cat <<'JSON'
{"type":"object","properties":{
  "promotions":{"type":"array","items":{"type":"object","properties":{
    "issue":{"type":"integer"},"flag_side":{"type":"string","enum":["flag","side"]},
    "channel":{"type":"string","enum":["blog","linkedin","talk"]}},
    "required":["issue","flag_side","channel"]}},
  "holds":{"type":"array","items":{"type":"object","properties":{
    "issue":{"type":"integer"},"comment":{"type":"string"}},"required":["issue","comment"]}},
  "drops":{"type":"array","items":{"type":"object","properties":{
    "issue":{"type":"integer"},"reason":{"type":"string"}},"required":["issue","reason"]}},
  "slots":{"type":"array","items":{"type":"object","properties":{
    "issue":{"type":"integer"},"date":{"type":"string"}},"required":["issue","date"]}},
  "ping":{"type":"string"}},
  "required":["promotions","holds","drops","slots","ping"]}
JSON
}

decide() {   # $1 = state json file (or - for stdin)
  reporoot
  local state prompt; state=$(cat "${1:--}")
  prompt=$(cat <<EOF
$(cat "$BEAT_DOC")

---
You are executing the Monday planning Beat above, but you do NOT run any tools. You are given the
current Pipeline state as JSON and must return ONLY a decision object (matching the schema) that a
deterministic script will apply. Judge ideas with the editorial signal framework, promote the strong
ones (flag/side + channel), hold or drop the rest, slot this week defending the Cadence floor, and
write the plan ping (one-line summary + direct links like https://github.com/$REPO/issues/<n> and the
board https://github.com/users/$OWNER/projects/$PROJECT). Reference only issue numbers present in the
state. Never draft article content.

CURRENT STATE:
$state
EOF
)
  gemini_decide "$prompt" "$(decision_schema)"
}

apply() {   # $1 = decisions json file (or - for stdin)
  reporoot
  local d; d=$(cat "${1:--}")
  echo "$d" | jq -c '.promotions[]?' | while read -r p; do
    n=$(jq -r .issue <<<"$p"); fs=$(jq -r .flag_side <<<"$p"); ch=$(jq -r .channel <<<"$p")
    echo "promote #$n -> proposed,$fs,$ch"
    gh issue edit "$n" --repo "$REPO" --add-label "proposed,$fs,$ch" --remove-label idea
  done
  echo "$d" | jq -c '.holds[]?' | while read -r h; do
    n=$(jq -r .issue <<<"$h"); c=$(jq -r .comment <<<"$h"); echo "hold #$n"; gh issue comment "$n" --repo "$REPO" --body "$c"
  done
  echo "$d" | jq -c '.drops[]?' | while read -r x; do
    n=$(jq -r .issue <<<"$x"); r=$(jq -r .reason <<<"$x"); echo "drop #$n"; gh issue close "$n" --repo "$REPO" --comment "$r"
  done
  echo "$d" | jq -c '.slots[]?' | while read -r s; do
    n=$(jq -r .issue <<<"$s"); dt=$(jq -r .date <<<"$s"); echo "slot #$n @ $dt"; slot_issue "$n" "$dt"
  done
  notify_ping "$(echo "$d" | jq -r '.ping // empty')"
}

case "${1:-run}" in
  gather) gather ;;
  decide) decide "${2:--}" ;;
  apply)  apply  "${2:--}" ;;
  run)    tmp_s=$(mktemp) tmp_d=$(mktemp)
          gather >"$tmp_s"; decide "$tmp_s" >"$tmp_d"; apply "$tmp_d"; rm -f "$tmp_s" "$tmp_d" ;;
  *) echo "usage: monday.sh {gather|decide <state>|apply <decisions>|run}" >&2; exit 2 ;;
esac
