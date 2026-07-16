// Command contentos is the Content OS operations surface (ADR-0003): a single
// Go CLI of deterministic operations over the editorial Pipeline — "hands, not
// brain". Its first subcommand is `notify`, the send-only Telegram ping.
package main

import (
	"io"
	"os"

	"github.com/davideimola/content-os/internal/notify"
	"github.com/spf13/cobra"
)

func main() {
	code := 0
	root := newRootCmd(os.Stdin, os.Getenv, &code)
	if err := root.Execute(); err != nil {
		// A structural error (unknown command, bad flag): cobra has already
		// printed it. Subcommands report their own failures and set code instead.
		os.Exit(1)
	}
	os.Exit(code)
}

// newRootCmd builds the contentos command tree. stdin and getenv are injected so
// the tree is testable; exitCode receives a subcommand's process exit code — the
// subcommand prints its own diagnostics, so cobra stays silent about it.
func newRootCmd(stdin io.Reader, getenv func(string) string, exitCode *int) *cobra.Command {
	root := &cobra.Command{
		Use:   "contentos",
		Short: "Content OS operations surface",
		Long: "contentos is the Content OS operations surface (ADR-0003): deterministic\n" +
			"operations over the editorial Pipeline — hands, not brain.",
		SilenceUsage: true,
	}
	root.SetIn(stdin)

	notifyCmd := &cobra.Command{
		Use:   "notify [message ...]",
		Short: "Send a one-way ping to Davide on Telegram",
		Long: "Send a one-way ping to Davide on Telegram, wrapping the Telegram Bot API.\n\n" +
			"The message is the arguments joined with spaces, or stdin when there are none.\n" +
			"Exit status is the contract: 0 delivered, non-zero (with a reason on stderr) not.\n\n" +
			"Flag parsing is disabled so the message passes through verbatim; run\n" +
			"`contentos help notify` for this help.\n\n" +
			"Environment:\n" +
			"  TELEGRAM_BOT_TOKEN  (required)  bot token from BotFather\n" +
			"  TELEGRAM_CHAT_ID    (required)  the chat the ping is delivered to\n" +
			"  TELEGRAM_API_BASE   (optional)  API base URL; default https://api.telegram.org",
		// Send-only text may begin with '-'; pass every argument through untouched.
		DisableFlagParsing: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			*exitCode = notify.Run(args, cmd.InOrStdin(), cmd.ErrOrStderr(), getenv)
			return nil
		},
	}
	root.AddCommand(notifyCmd)
	return root
}
