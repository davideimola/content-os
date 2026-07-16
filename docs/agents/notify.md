# notify seam: send-only Telegram ping

`contentos notify` is the single command every [Beat](../../CONTEXT.md) uses to ping Davide on
Telegram. It is the first subcommand of the `contentos` CLI (ADR-0003) and wraps the Telegram
Bot API's `sendMessage` and nothing else: **send-only, no inbound webhook, no server**
(ADR-0002). A Beat has something for Davide → it calls `contentos notify` → a message lands on
his phone.

## Building the CLI

`contentos` is a Go binary built from this repo; no compiled binaries are committed.

- **Dev / other repos:** `go install github.com/davideimola/content-os/cmd/contentos@latest`.
- **From a checkout:** `go build -o contentos ./cmd/contentos`, or run directly with
  `go run ./cmd/contentos notify "..."`.
- **In the Beats:** the routine's setup script builds it from the cloned source — Go is
  preinstalled in the routine VM, and the toolchain is pinned in `mise.toml`.

## One-time setup (requires Davide)

1. **Create the bot.** In Telegram, open a chat with [@BotFather](https://t.me/BotFather),
   send `/newbot`, and follow the prompts. BotFather returns a **token** like
   `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. This is `TELEGRAM_BOT_TOKEN`.
2. **Open the conversation.** Find the new bot in Telegram and send it any message (e.g. `hi`).
   A bot cannot start a chat with you, so this first message is what lets it reply.
3. **Find your chat id.** With the token, run once (this is a read, kept out of the
   send-only tool by design):

   ```sh
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | jq '.result[].message.chat.id'
   ```

   The number it prints is `TELEGRAM_CHAT_ID`. (If it prints nothing, send the bot another
   message and retry.)
4. **Store the secrets.**
   - *Locally* (for testing): copy `.env.example` to `.env`, fill in both values, then load
     them before running the tool: `set -a; . ./.env; set +a`. `.env` is gitignored — never
     commit real values.
   - *In the Beats* (scheduled Claude routines): set `TELEGRAM_BOT_TOKEN` and
     `TELEGRAM_CHAT_ID` as **routine secrets**, not files.

## Usage (for the Beats)

```sh
contentos notify "Monday plan: 1 LinkedIn post + blog draft. https://github.com/davideimola/content-os/issues/42"
```

- Message text comes from the arguments, or from stdin if no arguments are given
  (`printf '%s' "$msg" | contentos notify`).
- Flag parsing is disabled on this subcommand, so the message passes through **verbatim** even
  when it begins with `-`. For the command's own help, use `contentos help notify`.
- **Exit status is the contract:** `0` means delivered; non-zero means it was *not*
  delivered and a clear reason is printed to stderr. A Beat must check the exit status and
  treat a failure as "Davide was not pinged", never assume success.
- Messages are sent as **plain text** — raw URLs auto-link, and there is nothing to escape.

## Ping format

Every ping is written so acting on it is **one tap** (user stories 11–13). Keep it to a
short summary plus direct links to the exact issues or board view:

```
<one-line summary of what needs Davide right now>

<item> → <direct link>
<item> → <direct link>
```

- Lead with the summary; a Beat's ping should be scannable in the notification preview.
- Every actionable item carries a **direct link** (issue URL or a filtered board view), so
  Davide never has to go hunting.
- Plain URLs auto-link in Telegram; link previews are disabled so multi-link pings stay
  compact. Respect the [Cadence](../../CONTEXT.md) as a floor — a missed-slot ping rescues,
  it never guilt-trips.

## Testing

- **Automated (no network):** `go test ./internal/notify/` (or the whole suite, `go test ./...`).
  The tests drive the command against an `httptest` fake API server via `TELEGRAM_API_BASE`, so
  they never hit the real API. They cover the happy path, missing/empty inputs, HTTP and
  transport failures, false `ok`, stdin, and that the token never leaks into an error message.
- **Live smoke test (needs the real secrets):** after setup, with the secrets loaded, run
  `contentos notify "notify seam smoke test"` and confirm the message arrives. The Beats then
  assume the seam works.
