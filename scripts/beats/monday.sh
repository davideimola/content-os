#!/usr/bin/env bash
# Monday planning Beat — separated runner (ADR-0003 hands/brain).
#
#   GATHER (deterministic gh)  -> state JSON
#   DECIDE (one Gemini REST call, JSON mode, NON-agentic) -> decisions JSON
#   APPLY  (deterministic gh + contentos) -> labels, board slots, one Telegram ping
#
# The editorial *judgement* lives in docs/agents/monday-beat.md — this script feeds that doc
# to the model as the decision prompt and only executes the JSON the model returns. No agent
# loop: the model is a pure function state -> decisions.
#
# Stages are separately runnable for debugging:
#   monday.sh gather                 # -> state JSON on stdout
#   monday.sh decide  <state.json>   # -> decisions JSON on stdout
#   monday.sh apply   <decisions.json>
#   monday.sh run                    # gather | decide | apply, end to end
#
# Env: GEMINI_API_KEY (decide), GH_TOKEN (gh, repo+project), TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID (notify).
set -euo pipefail

REPO="davideimola/content-os"
OWNER="davideimola"
PROJECT="2"
PID="PVT_kwHOAN8k8s4Bdpom"                       # project id (see docs/agents/calendar.md)
DATE_FID="PVTF_lAHOAN8k8s4BdpomzhYJsS8"          # Date field
STAGE_FID="PVTSSF_lAHOAN8k8s4BdpomzhYJsTA"       # Stage field
STAGE_SLOTTED="4cd2f423"                          # Stage option: slotted
MODEL="${GEMINI_MODEL:-gemini-flash-lite-latest}"   # free-tier daily quota is small & per-model; override with GEMINI_MODEL
BEAT_DOC="docs/agents/monday-beat.md"
here() { cd "$(git rev-parse --show-toplevel)"; }

week_bounds() {   # prints "MON SUN TODAY" for the current ISO week
  local dow mon sun today
  today=$(date +%F); dow=$(date +%u)
  mon=$(date -d "-$((dow-1)) days" +%F 2>/dev/null || date -v-$((dow-1))d +%F)
  sun=$(date -d "+$((7-dow)) days" +%F 2>/dev/null || date -v+$((7-dow))d +%F)
  echo "$mon $sun $today"
}

gather() {
  here
  read -r MON SUN TODAY <<<"$(week_bounds)"
  local ideas inflight published board
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

# JSON schema the model must return (Gemini structured output).
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
  here
  local state prompt schema resp
  state=$(cat "${1:--}")
  schema=$(decision_schema)
  prompt=$(cat <<EOF
$(cat "$BEAT_DOC")

---
You are executing the Monday planning Beat above, but you do NOT run any tools. You are given the
current Pipeline state as JSON and must return ONLY a decision object (matching the provided schema)
that a deterministic script will then apply. Judge the ideas with the editorial signal framework,
promote the strong ones (flag/side + channel), hold or drop the rest, slot this week defending the
Cadence floor, and write the plan ping (one-line summary + direct links like
https://github.com/$REPO/issues/<n> and the board https://github.com/users/$OWNER/projects/$PROJECT).
Never invent issues; only reference issue numbers present in the state. Never draft article content.

CURRENT STATE:
$state
EOF
)
  local payload attempt=0 max=5 code
  payload=$(jq -n --arg p "$prompt" --argjson schema "$schema" \
    '{contents:[{parts:[{text:$p}]}],
      generationConfig:{responseMimeType:"application/json", responseSchema:$schema, temperature:0.2}}')
  while :; do
    attempt=$((attempt+1))
    resp=$(curl -sS "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}" \
      -H 'Content-Type: application/json' -d "$payload")
    if echo "$resp" | jq -e '.candidates[0].content.parts[0].text' >/dev/null 2>&1; then
      echo "$resp" | jq -r '.candidates[0].content.parts[0].text'; return 0
    fi
    code=$(echo "$resp" | jq -r '.error.code // "?"')
    # 503 = transient overload → back off & retry a few times.
    if [ "$code" = "503" ] && [ "$attempt" -lt "$max" ]; then
      echo "DECIDE: Gemini 503 (attempt $attempt/$max) — retrying in $((attempt*15))s" >&2
      sleep $((attempt*15)); continue
    fi
    # 429 may be per-minute (clears) or per-day quota (won't) — retry ONCE only, so we don't
    # burn the small free-tier daily quota hammering an exhausted limit.
    if [ "$code" = "429" ] && [ "$attempt" -lt 2 ]; then
      echo "DECIDE: Gemini 429 — one retry in 12s" >&2; sleep 12; continue
    fi
    echo "DECIDE failed (code $code) after $attempt attempt(s) — Gemini response:" >&2
    echo "$resp" >&2; return 1
  done
}

apply() {   # $1 = decisions json file (or - for stdin)
  here
  local d; d=$(cat "${1:--}")
  read -r _ _ TODAY <<<"$(week_bounds)"

  echo "$d" | jq -c '.promotions[]?' | while read -r p; do
    n=$(jq -r .issue <<<"$p"); fs=$(jq -r .flag_side <<<"$p"); ch=$(jq -r .channel <<<"$p")
    echo "promote #$n -> proposed,$fs,$ch"
    gh issue edit "$n" --repo "$REPO" --add-label "proposed,$fs,$ch" --remove-label idea
  done

  echo "$d" | jq -c '.holds[]?' | while read -r h; do
    n=$(jq -r .issue <<<"$h"); c=$(jq -r .comment <<<"$h")
    echo "hold #$n"; gh issue comment "$n" --repo "$REPO" --body "$c"
  done

  echo "$d" | jq -c '.drops[]?' | while read -r x; do
    n=$(jq -r .issue <<<"$x"); r=$(jq -r .reason <<<"$x")
    echo "drop #$n"; gh issue close "$n" --repo "$REPO" --comment "$r"
  done

  echo "$d" | jq -c '.slots[]?' | while read -r s; do
    n=$(jq -r .issue <<<"$s"); dt=$(jq -r .date <<<"$s")
    echo "slot #$n @ $dt"
    gh issue edit "$n" --repo "$REPO" --add-label slotted --remove-label proposed || true
    item=$(gh project item-add "$PROJECT" --owner "$OWNER" \
            --url "https://github.com/$REPO/issues/$n" --format json --jq .id)
    gh project item-edit --project-id "$PID" --id "$item" --field-id "$DATE_FID"  --date "$dt" >/dev/null
    gh project item-edit --project-id "$PID" --id "$item" --field-id "$STAGE_FID" --single-select-option-id "$STAGE_SLOTTED" >/dev/null
  done

  local ping; ping=$(echo "$d" | jq -r '.ping // empty')
  if [ -n "$ping" ]; then
    echo "notify"; contentos notify "$ping"
  else
    echo "no ping in decision (skipping notify)"
  fi
}

case "${1:-run}" in
  gather) gather ;;
  decide) decide "${2:--}" ;;
  apply)  apply  "${2:--}" ;;
  run)    tmp_s=$(mktemp) tmp_d=$(mktemp)
          gather >"$tmp_s"; decide "$tmp_s" >"$tmp_d"; apply "$tmp_d"; rm -f "$tmp_s" "$tmp_d" ;;
  *) echo "usage: monday.sh {gather|decide <state>|apply <decisions>|run}" >&2; exit 2 ;;
esac
