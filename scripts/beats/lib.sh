#!/usr/bin/env bash
# Shared helpers for the Beats. The Beats are deterministic staleness reminders —
# detect -> ping (ADR-0013), no model, no state file. Hands, not brain (ADR-0003).
#
# The Pipeline's source of truth is Supabase (ADR-0014); the Beats read it straight
# from PostgREST — their `detect` is a `curl` on a Supabase view (ADR-0014 dec.7),
# not `gh`. This is the same direct-PostgREST path the front end uses for non-AI
# surfaces (ADR-0015 dec.1); the content-os MCP adapter stays the AI-app door. The
# Desk's tracker writes are MCP tools now (ADR-0015), so the old `gh` Desk hands
# that lived here are gone. See docs/agents/beat-scheduling.md.
set -euo pipefail

# supabase_get <path> — GET a PostgREST resource and print the JSON body on stdout.
# <path> is everything after `/rest/v1/` (e.g. "untriaged_proposals?select=id").
# Reads with the SERVICE_ROLE key: the views the Beats need (untriaged_proposals,
# cadence_status, metrics_site) are behind RLS, and service_role has SELECT on
# exactly those (the metrics/ops grant migrations). `curl -f` turns any HTTP error
# into a non-zero exit, so under errexit a failed read ABORTS the run rather than
# emitting empty — a swallowed error never masquerades as a fresh all-clear.
# Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. (The migrations CI already trusts
# CI with stronger Supabase tokens, so the service_role key adds no new surface.)
supabase_get() {
  local path="${1:?supabase_get: a PostgREST path is required}"
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "supabase_get: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set" >&2
    return 1
  fi
  curl -fsS "${SUPABASE_URL%/}/rest/v1/${path}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
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

# beat_ping — a Beat's `run` stage: execute the calling script's detect() and hand its output
# to notify_ping (empty ⇒ silent). detect runs at top level (a plain redirection, NOT a `$()`
# subshell), so under errexit a failing read inside it aborts the run fail-loud — never a false
# silent all-clear (a swallowed curl error looking like "nothing stale") nor a false ping.
beat_ping() {
  local out; out=$(mktemp)
  detect >"$out"
  notify_ping "$(cat "$out")"
  rm -f "$out"
}
