// Package idea implements `contentos idea create`: the terminal capture door
// that files a raw Idea onto the Pipeline in under thirty seconds, asking no
// format, channel, or quality question — capture first, judge later (see
// docs/agents/idea.md and the pipeline taxonomy). The Monday planning Beat
// judges the idea afterwards; this seam only files it.
//
// It is the first GitHub-touching subcommand, and per ADR-0004 it reaches
// GitHub by shelling out to the `gh` CLI rather than embedding a GitHub client:
// the door runs on Davide's machine where `gh` is already installed and
// authenticated. GitHub issues stay the single source of truth (ADR-0001).
package idea

import (
	"bytes"
	"fmt"
	"io"
	"os/exec"
	"strings"
)

const (
	// repo is the Pipeline's single home (ADR-0001). The door runs from any repo
	// on the machine, so the target is fixed here, never inferred from the cwd.
	repo = "davideimola/content-os"
	// ideaLabel is the capture-time state: a raw, unjudged spark (pipeline
	// taxonomy). Nothing else is set — no format, channel, or quality decision.
	ideaLabel = "idea"
	// titlePrefix matches the Idea issue template so every idea reads uniformly
	// in the tracker, however it was filed.
	titlePrefix = "[Idea] "
	// maxTitleRunes caps the summary derived from the spark's first line; the full
	// spark always survives verbatim as the issue body.
	maxTitleRunes = 72
)

// Commander runs an external command to completion and returns its stdout,
// stderr, and run error. It is the single seam to the outside world (the `gh`
// CLI); tests substitute a fake so they need no network, no auth, and no gh.
type Commander func(name string, args ...string) (stdout, stderr string, err error)

// Run files the spark as an Idea issue and returns a process exit code: 0 when
// the issue was created — its URL is echoed to stdout — non-zero (with a clear
// line on stderr) otherwise. The spark is the arguments joined with spaces, or
// stdin when there are none, mirroring `contentos notify`.
func Run(args []string, stdin io.Reader, stdout, stderr io.Writer, run Commander) int {
	fail := func(msg string) int {
		fmt.Fprintf(stderr, "contentos idea create: %s\n", msg)
		return 1
	}

	spark, err := sparkFrom(args, stdin)
	if err != nil {
		return fail(err.Error())
	}
	if strings.TrimSpace(spark) == "" {
		return fail("refusing to file an empty idea — pass the spark as an argument or on stdin.")
	}

	out, errOut, err := run("gh",
		"issue", "create",
		"--repo", repo,
		"--title", titleFrom(spark),
		"--body", spark,
		"--label", ideaLabel,
	)
	if err != nil {
		// Surface gh's own diagnostic when it ran and failed; fall back to the run
		// error itself when it could not start (e.g. gh not installed).
		detail := strings.TrimSpace(errOut)
		if detail == "" {
			detail = err.Error()
		}
		return fail(fmt.Sprintf("gh issue create failed: %s", detail))
	}

	// gh prints the new issue's URL; pass it straight through so acting on the
	// fresh idea is one tap away.
	if url := strings.TrimSpace(out); url != "" {
		fmt.Fprintln(stdout, url)
	}
	return 0
}

// sparkFrom returns the arguments joined with spaces, or stdin with trailing
// newlines trimmed (matching the shell's $(cat)) when there are no arguments.
// A genuine stdin read failure is reported rather than masqueraded as empty.
func sparkFrom(args []string, stdin io.Reader) (string, error) {
	if len(args) > 0 {
		return strings.Join(args, " "), nil
	}
	b, err := io.ReadAll(stdin)
	if err != nil {
		return "", fmt.Errorf("could not read the spark from stdin: %w", err)
	}
	return strings.TrimRight(string(b), "\r\n"), nil
}

// titleFrom derives a compact issue title from the spark: its first non-empty
// line, whitespace-trimmed and length-capped on a rune boundary, behind the
// template's "[Idea] " prefix. This is only a scannable label for the tracker —
// the full spark is preserved as the issue body. The caller guarantees the
// spark is non-blank, so a non-empty line always exists.
func titleFrom(spark string) string {
	summary := ""
	for line := range strings.SplitSeq(spark, "\n") {
		if s := strings.TrimSpace(line); s != "" {
			summary = s
			break
		}
	}
	if runes := []rune(summary); len(runes) > maxTitleRunes {
		summary = strings.TrimRight(string(runes[:maxTitleRunes-1]), " ") + "…"
	}
	return titlePrefix + summary
}

// System is the production Commander: it shells out with os/exec, capturing
// stdout and stderr separately so Run can surface gh's own diagnostic.
func System(name string, args ...string) (stdout, stderr string, err error) {
	cmd := exec.Command(name, args...)
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	err = cmd.Run()
	return out.String(), errb.String(), err
}
