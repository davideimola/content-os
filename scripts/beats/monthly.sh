#!/usr/bin/env bash
# Monthly review Beat — separated runner (ADR-0003). Reviews the just-ended month:
#   GATHER (gh + metrics files) -> DECIDE (Gemini) -> APPLY (one contentos notify).
# Semi-interactive: the LinkedIn export can't be pulled, so on a run with no metrics yet the DECIDE
# produces the opening ASK ping (request export + site numbers); when metrics/<month>/ already exist
# it produces the digest (mix vs ~70%, Cadence vs floor, CFP horizon, number-cited recs). The
# normalize+commit ingest stays the interactive path (metrics-ingest.md), not this autonomous run.
# Judgement lives in docs/agents/monthly-beat.md. Stages: monthly.sh {gather|decide <s>|apply <d>|run}.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
BEAT_DOC="docs/agents/monthly-beat.md"

prev_month() {   # YYYY-MM of the just-ended month
  date -d "$(date +%Y-%m-01) -1 day" +%Y-%m 2>/dev/null || date -v1d -v-1m +%Y-%m
}

gather() {
  reporoot
  local month li site published talks_cfp blog
  month=$(prev_month)
  li=null; [ -f "metrics/$month/linkedin-posts.csv" ] && li=$(jq -Rs . <"metrics/$month/linkedin-posts.csv")
  site=null; [ -f "metrics/$month/site.csv" ] && site=$(jq -Rs . <"metrics/$month/site.csv")
  published=$(gh issue list --repo "$REPO" --state all --label published \
            --json number,title,labels,closedAt \
            --jq '[.[] | {number, title, labels:[.labels[].name], closedAt}]')
  talks_cfp=$(gh project item-list "$PROJECT" --owner "$OWNER" --query "label:talk,cfp" --format json -L 200 \
            --jq '[.items[] | {number:.content.number, title:.content.title, date:(.date[0:10]), stage}]')
  blog=$(gh project item-list "$PROJECT" --owner "$OWNER" --query "label:blog" --format json -L 200 \
            --jq '[.items[] | {number:.content.number, title:.content.title, date:(.date[0:10]), stage}]')
  jq -n --arg month "$month" --argjson linkedin_metrics "$li" --argjson site_metrics "$site" \
        --argjson published "$published" --argjson talks_cfp "$talks_cfp" --argjson blog "$blog" \
    '{month:$month, metrics_present:(($linkedin_metrics!=null) or ($site_metrics!=null)),
      linkedin_metrics:$linkedin_metrics, site_metrics:$site_metrics,
      published:$published, talks_cfp:$talks_cfp, blog:$blog}'
}

decision_schema() {
  cat <<'JSON'
{"type":"object","properties":{"ping":{"type":"string"}},"required":["ping"]}
JSON
}

decide() {   # $1 = state json file
  reporoot
  local state prompt; state=$(cat "${1:--}")
  prompt=$(cat <<EOF
$(cat "$BEAT_DOC")

---
You are executing the Monthly review Beat above, but you do NOT run any tools. Given the state JSON,
return ONLY {"ping": "..."}:
- If metrics_present is FALSE: write the opening ritual ASK ping — greet the month (state.month), ask
  Davide for that month's LinkedIn analytics export and the Vercel site numbers (visitors, page views),
  since they can't be pulled automatically. One message.
- If metrics_present is TRUE: write the digest — cross linkedin_metrics/site_metrics with the month's
  published pieces (filter published to state.month by closedAt), report the Flag/Side mix vs ~70% and
  Cadence vs the floor (1 LinkedIn/week, 1 blog/month), name next month's blog-slot status and the CFP
  horizon (talks_cfp), and give recommendations that CITE the numbers. Include the board link
  https://github.com/users/$OWNER/projects/$PROJECT.
Reference only issues present in the state. Never draft article content.

CURRENT STATE:
$state
EOF
)
  gemini_decide "$prompt" "$(decision_schema)"
}

apply() {   # $1 = decisions json file — Monthly sends one ping (ask or digest)
  reporoot
  local d; d=$(cat "${1:--}")
  notify_ping "$(echo "$d" | jq -r '.ping // empty')"
}

case "${1:-run}" in
  gather) gather ;;
  decide) decide "${2:--}" ;;
  apply)  apply  "${2:--}" ;;
  run)    tmp_s=$(mktemp) tmp_d=$(mktemp)
          gather >"$tmp_s"; decide "$tmp_s" >"$tmp_d"; apply "$tmp_d"; rm -f "$tmp_s" "$tmp_d" ;;
  *) echo "usage: monthly.sh {gather|decide <state>|apply <decisions>|run}" >&2; exit 2 ;;
esac
