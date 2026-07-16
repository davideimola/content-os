// Package notify implements the `contentos notify` subcommand: a send-only
// ping to Davide on Telegram, wrapping the Telegram Bot API's sendMessage.
//
// It is the Content OS "notify" seam (see docs/agents/notify.md and ADR-0003):
// send-only by design — no inbound webhook, no server. Every Beat pings
// exclusively through it. The bot token lives only in the request URL and is
// never allowed to reach an error message.
package notify

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// notDelivered is the shared suffix so every delivery failure reads identically.
const notDelivered = "The ping was not delivered."

// httpTimeout bounds a single send so a stuck network can never hang a Beat.
const httpTimeout = 15 * time.Second

// Run executes the notify subcommand and returns a process exit code: 0 when the
// message was delivered, non-zero (with a clear line on stderr) otherwise.
//
// args are the subcommand's arguments; the message is all of them joined with
// spaces, or stdin when there are none. getenv reads configuration:
//
//	TELEGRAM_BOT_TOKEN  (required)  bot token from BotFather
//	TELEGRAM_CHAT_ID    (required)  the chat the ping is delivered to
//	TELEGRAM_API_BASE   (optional)  API base URL; default https://api.telegram.org
func Run(args []string, stdin io.Reader, stderr io.Writer, getenv func(string) string) int {
	fail := func(msg string) int {
		fmt.Fprintf(stderr, "contentos notify: %s\n", msg)
		return 1
	}

	token := getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		return fail("TELEGRAM_BOT_TOKEN is not set — create a bot with BotFather and store the token as a secret (see docs/agents/notify.md).")
	}
	chatID := getenv("TELEGRAM_CHAT_ID")
	if chatID == "" {
		return fail("TELEGRAM_CHAT_ID is not set — store your chat id as a secret (see docs/agents/notify.md).")
	}
	apiBase := getenv("TELEGRAM_API_BASE")
	if apiBase == "" {
		apiBase = "https://api.telegram.org"
	}

	message, err := messageFrom(args, stdin)
	if err != nil {
		return fail(err.Error())
	}
	if message == "" {
		return fail("refusing to send an empty message — pass text as an argument or on stdin.")
	}

	if err := send(apiBase, token, chatID, message); err != nil {
		return fail(err.Error())
	}
	return 0
}

// messageFrom returns the arguments joined with spaces, or stdin with trailing
// newlines trimmed (matching the shell's $(cat)) when there are no arguments.
// A genuine stdin read failure is reported rather than masqueraded as empty.
func messageFrom(args []string, stdin io.Reader) (string, error) {
	if len(args) > 0 {
		return strings.Join(args, " "), nil
	}
	b, err := io.ReadAll(stdin)
	if err != nil {
		return "", fmt.Errorf("could not read the message from stdin: %w", err)
	}
	return strings.TrimRight(string(b), "\r\n"), nil
}

// send posts the message to Telegram's sendMessage and turns anything short of a
// confirmed delivery into an error whose text never contains the token.
func send(apiBase, token, chatID, message string) error {
	form := url.Values{}
	form.Set("chat_id", chatID)
	form.Set("text", message)
	form.Set("disable_web_page_preview", "true")

	endpoint := strings.TrimRight(apiBase, "/") + "/bot" + token + "/sendMessage"

	client := &http.Client{Timeout: httpTimeout}
	resp, err := client.PostForm(endpoint, form)
	if err != nil {
		// The client's error embeds the request URL, which holds the token. Only
		// ever surface the unwrapped transport reason (host:port, not the path);
		// fall back to a generic reason for any other error shape.
		reason := "unknown transport error"
		var uerr *url.Error
		if errors.As(err, &uerr) && uerr.Err != nil {
			reason = uerr.Err.Error()
		}
		return fmt.Errorf("could not reach the Telegram API (%s). %s", reason, notDelivered)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	desc, ok := parseResponse(body)

	// HTTP-level failure: surface Telegram's own description.
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Telegram rejected the send (HTTP %d): %s. %s", resp.StatusCode, desc, notDelivered)
	}
	// Even on a 2xx, Telegram reports real success via "ok":true.
	if !ok {
		return fmt.Errorf("Telegram reported the send as failed: %s. %s", desc, notDelivered)
	}
	return nil
}

// parseResponse pulls (description, ok) out of a Telegram JSON response,
// tolerating an empty or malformed body. The response never carries the token.
func parseResponse(body []byte) (desc string, ok bool) {
	var r struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(body, &r); err == nil {
		desc, ok = r.Description, r.OK
	}
	if desc == "" {
		if len(body) == 0 {
			desc = "no response body"
		} else {
			desc = string(body)
		}
	}
	return desc, ok
}
