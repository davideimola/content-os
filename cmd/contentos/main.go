// Command contentos is Davide's local Content OS operations surface (ADR-0003,
// narrowed by ADR-0009): deterministic, stateless operations over the editorial
// Pipeline — "hands, not brain". Two subcommands: `metrics-ingest` (normalize the
// monthly metrics) and `open` (browser shortcuts to Content OS destinations). It
// runs on Davide's machine, never in a Beat, and never touches GitHub.
package main

import (
	"io"
	"os"

	"github.com/davideimola/content-os/internal/metrics"
	"github.com/davideimola/content-os/internal/open"
	"github.com/spf13/cobra"
)

func main() {
	code := 0
	root := newRootCmd(os.Stdin, open.System, &code)
	if err := root.Execute(); err != nil {
		// A structural error (unknown command, bad flag): cobra has already
		// printed it. Subcommands report their own failures and set code instead.
		os.Exit(1)
	}
	os.Exit(code)
}

// newRootCmd builds the contentos command tree. stdin is injected so the tree is
// testable; exitCode receives a subcommand's process exit code — the subcommand
// prints its own diagnostics, so cobra stays silent about it.
func newRootCmd(stdin io.Reader, openFn open.Opener, exitCode *int) *cobra.Command {
	root := &cobra.Command{
		Use:   "contentos",
		Short: "Content OS operations surface",
		Long: "contentos is the Content OS operations surface (ADR-0003): deterministic\n" +
			"operations over the editorial Pipeline — hands, not brain.",
		SilenceUsage: true,
	}
	root.SetIn(stdin)

	root.AddCommand(newMetricsIngestCmd(exitCode))
	root.AddCommand(newOpenCmd(openFn, exitCode))
	return root
}

// newOpenCmd builds `contentos open` — utility shortcuts that open Content OS
// destinations (the Calendar board, Pipeline views, an issue, the Beats workflow)
// in the browser. With no target it shows an interactive menu. openFn is the seam
// to the OS browser opener; the open package prints its own diagnostics and sets
// exitCode, so cobra stays silent about them.
func newOpenCmd(openFn open.Opener, exitCode *int) *cobra.Command {
	return &cobra.Command{
		Use:   "open [target | issue <n> | <issue-n>]",
		Short: "Open Content OS destinations in the browser",
		Long: "Open a Content OS destination in the default browser.\n\n" +
			"Targets: board, pipeline, ideas, proposed, slotted, talks, blog, beats, repo.\n" +
			"Also `open issue <n>` or a bare `open <n>` for a specific issue. With no target,\n" +
			"pick interactively — via fzf when installed, otherwise a numbered menu.\n\n" +
			"Shell completion suggests the targets (`contentos completion <shell>`), so\n" +
			"`contentos open <TAB>` filters them — fuzzily with fzf-tab.\n\n" +
			"See docs/agents/open.md.",
		// Dynamic completion of the first argument: the targets (+ `issue`). With
		// fzf-tab this is a fuzzy picker over them — the idiomatic Cobra mechanism.
		ValidArgsFunction: func(_ *cobra.Command, args []string, _ string) ([]string, cobra.ShellCompDirective) {
			if len(args) > 0 {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}
			return open.Completions(), cobra.ShellCompDirectiveNoFileComp
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			*exitCode = open.Run(args, cmd.InOrStdin(), cmd.OutOrStdout(), cmd.ErrOrStderr(), openFn, open.SystemPicker)
			return nil
		},
	}
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
