#!/usr/bin/env bash
#
# Behavioural tests for the notify seam (bin/notify).
#
# No test framework (see the spec's Testing Decisions): a plain bash runner with a
# fake curl (test/fixtures/fake-curl) injected via NOTIFY_CURL, so nothing here
# touches the real Telegram API or the network. We assert only observable
# behaviour at the seam: exit status, stderr, and the request bin/notify builds.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$here/.." && pwd)"
notify="$repo_root/bin/notify"
fake_curl="$here/fixtures/fake-curl"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass=0
fail=0
ok() { printf 'ok   - %s\n' "$1"; pass=$((pass + 1)); }
no() { printf 'FAIL - %s\n' "$1"; [ -n "${2:-}" ] && printf '       %s\n' "$2"; fail=$((fail + 1)); }

assert_eq() { # LABEL EXPECTED ACTUAL
  if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "expected [$2], got [$3]"; fi
}
assert_ne() { # LABEL NOT-EXPECTED ACTUAL
  if [ "$2" != "$3" ]; then ok "$1"; else no "$1" "expected not [$2], got [$3]"; fi
}
assert_contains() { # LABEL HAYSTACK NEEDLE
  case "$2" in *"$3"*) ok "$1" ;; *) no "$1" "expected to contain [$3], got [$2]" ;; esac
}
assert_not_contains() { # LABEL HAYSTACK NEEDLE
  case "$2" in *"$3"*) no "$1" "expected NOT to contain [$3], got [$2]" ;; *) ok "$1" ;; esac
}
assert_absent() { # LABEL PATH
  if [ -e "$2" ]; then no "$1" "expected no file at $2"; else ok "$1"; fi
}

TOKEN="TEST-TOKEN-super-secret-123"
CHAT="424242"
args_out="$tmp/args"

reset_env() {
  export NOTIFY_CURL="$fake_curl"
  export TELEGRAM_BOT_TOKEN="$TOKEN"
  export TELEGRAM_CHAT_ID="$CHAT"
  export TELEGRAM_API_BASE="https://api.telegram.example"
  export FAKE_HTTP_CODE=200
  export FAKE_BODY='{"ok":true,"result":{"message_id":1}}'
  export FAKE_EXIT=0
  export FAKE_ARGS_OUT="$args_out"
}

run_notify() { # message args... (env taken from the exported environment)
  out="$("$notify" "$@" 2>"$tmp/err")"
  code=$?
  err="$(cat "$tmp/err")"
}

# --- happy path: delivers the message and exits 0 --------------------------
reset_env
run_notify "Monday plan ready: https://example.com/issues/7"
assert_eq        "happy path exits 0" 0 "$code"
sent="$(cat "$args_out")"
assert_contains  "sends the chat id"          "$sent" "chat_id=$CHAT"
assert_contains  "sends the message text"     "$sent" "text=Monday plan ready: https://example.com/issues/7"
assert_contains  "posts to the sendMessage endpoint" "$sent" "/bot$TOKEN/sendMessage"
assert_eq        "success is silent on stdout" "" "$out"
assert_contains  "compact pings: disables link preview" "$sent" "disable_web_page_preview=true"
assert_not_contains "plain text by default: no parse_mode" "$sent" "parse_mode"

# --- missing TELEGRAM_BOT_TOKEN: clear error, no send attempted -------------
reset_env
unset TELEGRAM_BOT_TOKEN
noargs="$tmp/noargs"; rm -f "$noargs"; export FAKE_ARGS_OUT="$noargs"
run_notify "hi"
assert_ne        "missing token: non-zero exit" 0 "$code"
assert_contains  "missing token: names the missing secret" "$err" "TELEGRAM_BOT_TOKEN"
assert_absent    "missing token: does not attempt a send"   "$noargs"

# --- missing TELEGRAM_CHAT_ID: clear error ---------------------------------
reset_env
unset TELEGRAM_CHAT_ID
run_notify "hi"
assert_ne        "missing chat id: non-zero exit" 0 "$code"
assert_contains  "missing chat id: names the missing secret" "$err" "TELEGRAM_CHAT_ID"

# --- empty message: refused ------------------------------------------------
reset_env
run_notify ""
assert_ne        "empty message: non-zero exit" 0 "$code"
assert_contains  "empty message: explains why"  "$err" "empty"

# --- API rejection (HTTP 4xx): surfaces Telegram's description -------------
reset_env
export FAKE_HTTP_CODE=400
export FAKE_BODY='{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}'
run_notify "hello"
assert_ne        "api error: non-zero exit" 0 "$code"
assert_contains  "api error: reports the HTTP status"   "$err" "400"
assert_contains  "api error: surfaces the description"  "$err" "chat not found"
assert_not_contains "api error: never leaks the token"  "$err" "$TOKEN"

# --- transport failure (curl can't connect): surfaced, not silent ----------
reset_env
export FAKE_EXIT=7
export FAKE_HTTP_CODE=000
run_notify "hello"
assert_ne        "transport failure: non-zero exit" 0 "$code"
assert_contains  "transport failure: explains it did not reach Telegram" "$err" "could not reach"
assert_not_contains "transport failure: never leaks the token" "$err" "$TOKEN"

# --- false success (HTTP 200 but ok:false): treated as a failure ----------
reset_env
export FAKE_HTTP_CODE=200
export FAKE_BODY='{"ok":false,"description":"Forbidden: bot was blocked by the user"}'
run_notify "hello"
assert_ne        "false ok: non-zero exit" 0 "$code"
assert_contains  "false ok: surfaces the description" "$err" "blocked"

# --- message from stdin ----------------------------------------------------
reset_env
out="$(printf '%s' "captured from stdin" | "$notify" 2>"$tmp/err")"; code=$?
sent="$(cat "$args_out")"
assert_eq        "stdin: exits 0" 0 "$code"
assert_contains  "stdin: sends the piped text" "$sent" "text=captured from stdin"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
