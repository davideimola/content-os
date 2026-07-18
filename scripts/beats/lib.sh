#!/usr/bin/env bash
# Shared helpers for the Beat runners (scripts/beats/<beat>.sh) — the separated
# GATHER -> DECIDE -> APPLY shape (ADR-0003 hands/brain). See docs/agents/beat-scheduling.md.
set -euo pipefail

REPO="davideimola/content-os"
OWNER="davideimola"
PROJECT="2"
PID="PVT_kwHOAN8k8s4Bdpom"                   # project id (docs/agents/calendar.md)
DATE_FID="PVTF_lAHOAN8k8s4BdpomzhYJsS8"      # Date field
STAGE_FID="PVTSSF_lAHOAN8k8s4BdpomzhYJsTA"   # Stage field
STAGE_SLOTTED="4cd2f423"                      # Stage option: slotted
STAGE_PROPOSED="744a04fe"                     # Stage option: proposed (de-slot target)
MODEL="${GEMINI_MODEL:-gemini-flash-lite-latest}"   # free-tier daily quota is small & per-model

reporoot() { cd "$(git rev-parse --show-toplevel)"; }

# prints "MON SUN TODAY" (ISO week of today); GNU (-d) and BSD (-v) date
week_bounds() {
  local dow mon sun today
  today=$(date +%F); dow=$(date +%u)
  mon=$(date -d "-$((dow-1)) days" +%F 2>/dev/null || date -v-$((dow-1))d +%F)
  sun=$(date -d "+$((7-dow)) days" +%F 2>/dev/null || date -v+$((7-dow))d +%F)
  echo "$mon $sun $today"
}

# gemini_decide <prompt> <schema-json> -> prints the model's decision JSON on stdout.
# One non-agentic REST call, JSON mode. Retries transient 503 with backoff; 429 (usually the
# small per-model daily free quota) once only, so we don't burn it hammering an exhausted limit.
gemini_decide() {
  local prompt="$1" schema="$2" payload attempt=0 max=5 resp code
  payload=$(jq -n --arg p "$prompt" --argjson s "$schema" \
    '{contents:[{parts:[{text:$p}]}],
      generationConfig:{responseMimeType:"application/json", responseSchema:$s, temperature:0.2}}')
  while :; do
    attempt=$((attempt+1))
    resp=$(curl -sS "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}" \
      -H 'Content-Type: application/json' -d "$payload")
    if echo "$resp" | jq -e '.candidates[0].content.parts[0].text' >/dev/null 2>&1; then
      echo "$resp" | jq -r '.candidates[0].content.parts[0].text'; return 0
    fi
    code=$(echo "$resp" | jq -r '.error.code // "?"')
    if [ "$code" = "503" ] && [ "$attempt" -lt "$max" ]; then
      echo "DECIDE: Gemini 503 (attempt $attempt/$max) — retrying in $((attempt*15))s" >&2
      sleep $((attempt*15)); continue
    fi
    if [ "$code" = "429" ] && [ "$attempt" -lt 2 ]; then
      echo "DECIDE: Gemini 429 — one retry in 12s" >&2; sleep 12; continue
    fi
    echo "DECIDE failed (code $code) after $attempt attempt(s) — Gemini response:" >&2
    echo "$resp" >&2; return 1
  done
}

# slot_issue <issue> <date> — label-first (source of truth), then mirror onto the board.
slot_issue() {
  local n="$1" dt="$2" item
  gh issue edit "$n" --repo "$REPO" --add-label slotted --remove-label proposed || true
  item=$(gh project item-add "$PROJECT" --owner "$OWNER" \
          --url "https://github.com/$REPO/issues/$n" --format json --jq .id)
  gh project item-edit --project-id "$PID" --id "$item" --field-id "$DATE_FID"  --date "$dt" >/dev/null
  gh project item-edit --project-id "$PID" --id "$item" --field-id "$STAGE_FID" --single-select-option-id "$STAGE_SLOTTED" >/dev/null
}

# deslot_issue <issue> — reverse of slot_issue (the Desk's de-slot, ADR-0007): back to
# proposed, off the week. Label-first (source of truth), then mirror onto the board —
# Stage -> proposed and the Date cleared (a proposed piece has no publish date).
deslot_issue() {
  local n="$1" item
  gh issue edit "$n" --repo "$REPO" --add-label proposed --remove-label slotted || true
  item=$(gh project item-add "$PROJECT" --owner "$OWNER" \
          --url "https://github.com/$REPO/issues/$n" --format json --jq .id)
  gh project item-edit --project-id "$PID" --id "$item" --field-id "$STAGE_FID" --single-select-option-id "$STAGE_PROPOSED" >/dev/null
  gh project item-edit --project-id "$PID" --id "$item" --field-id "$DATE_FID" --clear >/dev/null
}

# ─── Desk hands (ADR-0007, ADR-0011) ────────────────────────────────────────────────
# Deterministic three-tier reads/writes the Desk (/desk) calls directly — it no longer
# reuses monday.sh's gather/apply. Hands, not brain (ADR-0003): these never judge; the
# Desk (Claude + Davide) decides, then calls these at the one approved gate.

# read_pipeline — the Desk's three-tier read. Prints one JSON object:
#   {week, ideas_unjudged, ideas_accepted, pieces, published, board}
# Ideas are partitioned by their child-Piece count (the tier-identification rule,
# pipeline-taxonomy.md): 0 children = an unjudged Idea (the inbox to judge); >=1 = an
# accepted umbrella (its .pieces lists the child Piece numbers). `pieces` are the open
# Pieces (a state label, not `idea`); `published` and `board` give the overlap + week view.
read_pipeline() {
  reporoot
  local MON SUN TODAY ideas_raw ideas count i idea num kids pieces published board
  read -r MON SUN TODAY <<<"$(week_bounds)"
  ideas_raw=$(gh issue list --repo "$REPO" --label idea --state open --json number,title,body)
  ideas='[]'; count=$(jq 'length' <<<"$ideas_raw"); i=0
  while [ "$i" -lt "$count" ]; do
    idea=$(jq -c ".[$i]" <<<"$ideas_raw")
    num=$(jq -r '.number' <<<"$idea")
    kids=$(gh api "repos/$REPO/issues/$num/sub_issues" --jq '[.[].number]' 2>/dev/null || echo '[]')
    [ -z "$kids" ] && kids='[]'
    ideas=$(jq --argjson idea "$idea" --argjson kids "$kids" '. + [$idea + {pieces:$kids}]' <<<"$ideas")
    i=$((i+1))
  done
  pieces=$(gh issue list --repo "$REPO" --state open --search "label:proposed,slotted,in-production" \
            --json number,title,labels --jq '[.[] | {number, title, labels:[.labels[].name]}]')
  published=$(gh issue list --repo "$REPO" --state all --label published --limit 30 \
            --json number,title --jq '[.[] | {number, title}]')
  board=$(gh project item-list "$PROJECT" --owner "$OWNER" --format json -L 200 \
            --jq '[.items[] | {number: .content.number, title: .content.title, date: (.date[0:10]), stage}]')
  jq -n --arg mon "$MON" --arg sun "$SUN" --arg today "$TODAY" \
        --argjson ideas "$ideas" --argjson pieces "$pieces" \
        --argjson published "$published" --argjson board "$board" \
    '{week:{monday:$mon, sunday:$sun, today:$today},
      ideas_unjudged: [$ideas[] | select((.pieces|length)==0)],
      ideas_accepted: [$ideas[] | select((.pieces|length)>0)],
      pieces:$pieces, published:$published, board:$board}'
}

# accept_idea <idea> <flag|side> <blog|linkedin|talk> <title>
# Accept an Idea: spawn ONE Piece as a native sub-issue of <idea>, labelled `proposed`
# + one Flag/Side + one channel; the Idea stays OPEN as the umbrella. Call once per
# channel to spawn several Pieces. Accept is atomic — an accepted Idea always has >=1
# child, so there is no `accepted` marker label (pipeline-taxonomy.md). Prints the new
# Piece's issue number on stdout.
accept_idea() {
  local idea="$1" fs="$2" ch="$3" title="$4"
  case "$fs" in flag|side) ;; *) echo "accept_idea: flag_side must be flag|side, got '$fs'" >&2; return 2;; esac
  case "$ch" in blog|linkedin|talk) ;; *) echo "accept_idea: channel must be blog|linkedin|talk, got '$ch'" >&2; return 2;; esac
  local url piece_num piece_id body
  body="Spawned from idea #$idea by the Desk."$'\n\n'"Part of #$idea."
  url=$(gh issue create --repo "$REPO" --title "$title" --body "$body" \
          --label proposed --label "$fs" --label "$ch" | tail -1)
  piece_num=$(basename "$url")
  piece_id=$(gh api "repos/$REPO/issues/$piece_num" --jq .id)
  gh api --method POST "repos/$REPO/issues/$idea/sub_issues" -F sub_issue_id="$piece_id" >/dev/null
  echo "$piece_num"
}

# reject_idea <idea> <reason> — reject an Idea: close it with a one-line why on the record.
reject_idea() {
  local n="$1" reason="$2"
  gh issue close "$n" --repo "$REPO" --comment "$reason"
}

# block_piece <blocked> <blocker> — native Piece->Piece dependency: <blocked> is
# blocked_by <blocker> (e.g. the LinkedIn amplifier blocked by the blog Piece it
# sneak-peeks). Uses the blocker's numeric DB id, as issue-tracker.md documents.
block_piece() {
  local blocked="$1" blocker="$2" blocker_id
  blocker_id=$(gh api "repos/$REPO/issues/$blocker" --jq .id)
  gh api --method POST "repos/$REPO/issues/$blocked/dependencies/blocked_by" -F issue_id="$blocker_id" >/dev/null
  echo "blocked #$blocked by #$blocker"
}

# notify_ping <text> — send one Telegram ping, or nothing if empty (silence is valid).
# ADR-0009: the send is inline curl to the Bot API's sendMessage (no CLI). Exit status is
# the contract: 0 delivered, non-zero (reason on stderr) not. Plain text, link previews off.
# The bot token lives only in the URL handed to curl — never echoed — and GitHub Actions
# masks it in logs. TELEGRAM_API_BASE overrides the host (default api.telegram.org; tests
# point it at a fake server). Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
notify_ping() {
  local text="${1:-}"
  if [ -z "$text" ]; then echo "(no ping — silent)"; return 0; fi
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    echo "notify_ping: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set" >&2; return 1
  fi
  echo "notify"
  local base resp
  base="${TELEGRAM_API_BASE:-https://api.telegram.org}"
  resp=$(curl -sS -X POST "${base}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
           --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
           --data-urlencode "text=${text}" \
           --data-urlencode "disable_web_page_preview=true") \
    || { echo "notify_ping: curl could not reach Telegram" >&2; return 1; }
  if ! echo "$resp" | jq -e '.ok == true' >/dev/null 2>&1; then
    echo "notify_ping: Telegram rejected the message: $(echo "$resp" | jq -r '.description // "unknown error"')" >&2
    return 1
  fi
}
