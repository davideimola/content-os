# notify seam: the Beats' Telegram ping

The notify seam is how a [Beat](../../CONTEXT.md) pings Davide on Telegram: **`notify_ping "<text>"`**,
a bash function in [`scripts/beats/lib.sh`](../../scripts/beats/lib.sh). It wraps the Telegram Bot
API's `sendMessage` and nothing else — **send-only, no inbound webhook, no server** (ADR-0002). A Beat
has something for Davide → its `run` hands the detect result to `notify_ping` → a message lands on his
phone (an empty result is silence).

It used to be a `contentos notify` subcommand; [ADR-0009](../adr/0009-contentos-narrows-to-local-surface.md)
moved it back into the Beats' bash. The Beats run as GitHub Actions — `gh` + this Telegram `curl` + `jq`,
no compiled dependency — so the send lives where its only caller lives. The credential risk a compiled
tool used to guard against is covered here by GitHub Actions' automatic secret masking and the beat
scripts' lack of `set -x`.

## The seam

```sh
notify_ping "Monday plan — 1 LinkedIn + blog draft this week.
LinkedIn: <thesis> → https://github.com/davideimola/content-os/issues/42
Board: https://github.com/users/davideimola/projects/2"
```

- **Message from the single argument.** An **empty** argument is valid and means *silence* —
  `notify_ping ""` sends nothing and returns `0`. Silence is a first-class outcome (the Thursday
  guard's on-track all-clear; the Desk's default when Davide is present).
- **Exit status is the contract:** `0` delivered; non-zero means it was *not* delivered, with a clear
  reason on stderr — missing secrets, a `curl` transport failure, or a Telegram `ok:false` (its
  `description` is surfaced). A Beat must treat a non-zero as "Davide was not pinged", never assume
  success.
- **Plain text**, link previews disabled (`disable_web_page_preview=true`) so multi-link pings stay
  compact — raw URLs auto-link and there is nothing to escape.
- **The token never leaks from the seam.** It lives only in the URL handed to `curl`; `notify_ping`
  never echoes it, and Actions masks registered secrets in the log regardless.

## Environment

- `TELEGRAM_BOT_TOKEN` (required) — bot token from BotFather.
- `TELEGRAM_CHAT_ID` (required) — the chat the ping is delivered to.
- `TELEGRAM_API_BASE` (optional) — API host; default `https://api.telegram.org`. Tests point it at a
  fake server so the seam is exercised without hitting the real API.

In the Beats these are **GitHub Actions secrets** (see [`beats.yml`](../../.github/workflows/beats.yml));
locally, keep them in a gitignored `.env` and load it (`set -a; . ./.env; set +a`) before sourcing
`lib.sh`. Never commit real values.

## One-time setup (requires Davide)

1. **Create the bot.** In Telegram, open a chat with [@BotFather](https://t.me/BotFather), send
   `/newbot`, and follow the prompts. BotFather returns a **token** like
   `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. This is `TELEGRAM_BOT_TOKEN`.
2. **Open the conversation.** Find the new bot in Telegram and send it any message (e.g. `hi`). A bot
   cannot start a chat with you, so this first message is what lets it reply.
3. **Find your chat id.** With the token, run once (a read, deliberately kept out of the send-only
   seam):

   ```sh
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | jq '.result[].message.chat.id'
   ```

   The number it prints is `TELEGRAM_CHAT_ID`. (If it prints nothing, send the bot another message
   and retry.)
4. **Store the secrets** — as Actions secrets for the Beats, and in a gitignored `.env` for local
   testing.

## Ping format

Every ping is written so acting on it is **one tap** (user stories 11–13). Keep it to a short summary
plus direct links to the exact issues or board view:

```
<one-line summary of what needs Davide right now>

<item> → <direct link>
<item> → <direct link>
```

- Lead with the summary; a Beat's ping should be scannable in the notification preview.
- Every actionable item carries a **direct link** (issue URL or a filtered board view), so Davide
  never has to go hunting.
- Plain URLs auto-link in Telegram; link previews are disabled so multi-link pings stay compact.
  Respect the [Cadence](../../CONTEXT.md) as a floor — a missed-slot ping rescues, it never
  guilt-trips.

## Testing

A Beat is verified at the tracker seam (no unit tests). Exercise the send directly:

- **Fake server (no network):** point `TELEGRAM_API_BASE` at a tiny local HTTP server that returns
  `{"ok":true}`, `source scripts/beats/lib.sh`, and call `notify_ping "..."` — assert exit `0` and the
  captured request shape (`chat_id`, url-encoded `text`). Feed it `{"ok":false,"description":"..."}` to
  confirm a rejection surfaces as a non-zero exit with the description, and an empty argument to
  confirm the silent path.
- **Live smoke test (real secrets):** with the secrets loaded,
  `source scripts/beats/lib.sh && notify_ping "notify seam smoke test"` and confirm the message
  arrives. The Beats then assume the seam works.
