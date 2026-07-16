// Command contentos is the Content OS operations surface (ADR-0003): a single
// Go CLI of deterministic operations over the editorial Pipeline — "hands, not
// brain". Its first subcommand is `notify`, the send-only Telegram ping.
package main

import (
	"io"
	"os"

	"github.com/davideimola/content-os/internal/metrics"
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
	root.AddCommand(newMetricsIngestCmd(exitCode))
	return root
}

// newMetricsIngestCmd builds `contentos metrics-ingest` and its two input paths:
// `linkedin` (a per-post export CSV) and `site` (manually reported numbers).
// Both normalize into metrics/<month>/ and set exitCode; the metrics package
// prints its own diagnostics, so cobra stays silent about them.
func newMetricsIngestCmd(exitCode *int) *cobra.Command {
	ingest := &cobra.Command{
		Use:   "metrics-ingest",
		Short: "Normalize raw monthly metrics into the repo",
		Long: "metrics-ingest turns the raw monthly inputs — a LinkedIn per-post export (CSV)\n" +
			"and manually reported site numbers — into normalized, versioned plain-text files\n" +
			"under metrics/<YYYY-MM>/. The monthly review reads only this normalized form.\n\n" +
			"The transform is deterministic and idempotent: re-running on the same input\n" +
			"produces byte-identical output.\n\n" +
			"See docs/agents/metrics-ingest.md for the input contract and how the review Beat\n" +
			"produces the LinkedIn CSV from the raw export.",
	}

	linkedin := &cobra.Command{
		Use:   "linkedin",
		Short: "Normalize a LinkedIn per-post export CSV",
		Long: "Normalize a LinkedIn per-post export CSV into metrics/<month>/linkedin-posts.csv.\n\n" +
			"The input CSV needs the columns date, post_url, impressions, reactions, comments,\n" +
			"reshares (any order; extra columns are ignored). See docs/agents/metrics-ingest.md.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			file, _ := cmd.Flags().GetString("file")
			month, _ := cmd.Flags().GetString("month")
			metricsDir, _ := cmd.Flags().GetString("metrics-dir")
			*exitCode = metrics.RunLinkedIn(file, month, metricsDir, cmd.OutOrStdout(), cmd.ErrOrStderr())
			return nil
		},
	}
	linkedin.Flags().String("file", "", "path to the LinkedIn per-post export CSV (required)")
	linkedin.Flags().String("month", "", "snapshot month as YYYY-MM (required)")
	linkedin.Flags().String("metrics-dir", "metrics", "root of the metrics area")
	_ = linkedin.MarkFlagRequired("file")
	_ = linkedin.MarkFlagRequired("month")

	site := &cobra.Command{
		Use:   "site",
		Short: "Normalize manually reported site numbers",
		Long: "Normalize manually reported site numbers into metrics/<month>/site.csv.\n\n" +
			"--visitors and --page-views are the two core Vercel Analytics counts; at least\n" +
			"one is required.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			month, _ := cmd.Flags().GetString("month")
			metricsDir, _ := cmd.Flags().GetString("metrics-dir")

			var visitors, pageViews *int
			if cmd.Flags().Changed("visitors") {
				v, _ := cmd.Flags().GetInt("visitors")
				visitors = &v
			}
			if cmd.Flags().Changed("page-views") {
				v, _ := cmd.Flags().GetInt("page-views")
				pageViews = &v
			}
			*exitCode = metrics.RunSite(month, metricsDir, visitors, pageViews, cmd.OutOrStdout(), cmd.ErrOrStderr())
			return nil
		},
	}
	site.Flags().String("month", "", "snapshot month as YYYY-MM (required)")
	site.Flags().String("metrics-dir", "metrics", "root of the metrics area")
	site.Flags().Int("visitors", 0, "unique visitors for the month")
	site.Flags().Int("page-views", 0, "page views for the month")
	_ = site.MarkFlagRequired("month")

	ingest.AddCommand(linkedin, site)
	return ingest
}
