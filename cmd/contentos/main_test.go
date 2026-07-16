package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/davideimola/content-os/internal/idea"
)

// testdataDir points at the metrics package's fixtures from this package's dir.
var testdataDir = filepath.Join("..", "..", "internal", "metrics", "testdata")

func noEnv(string) string { return "" }

// unusedRunner stands in for the `gh` seam on paths that must never reach it; it
// fails loudly if a test unexpectedly shells out.
func unusedRunner(string, ...string) (string, string, error) {
	return "", "", errors.New("gh runner unexpectedly invoked")
}

// execCmd drives the command tree with args and captured IO, returning the
// subcommand exit code, stdout, stderr, and any structural error from Execute.
// It wires the gh seam to unusedRunner — for the idea-create path, use
// execCmdWithRunner and inject a fake instead.
func execCmd(t *testing.T, args []string, stdin string, getenv func(string) string) (code int, stdout, stderr string, err error) {
	t.Helper()
	return execCmdWithRunner(t, args, stdin, getenv, unusedRunner)
}

// execCmdWithRunner is execCmd with the gh seam injected, so the idea-create
// wiring can be exercised end-to-end through cobra without touching GitHub.
func execCmdWithRunner(t *testing.T, args []string, stdin string, getenv func(string) string, run idea.Commander) (code int, stdout, stderr string, err error) {
	t.Helper()
	root := newRootCmd(strings.NewReader(stdin), getenv, run, &code)
	var out, errb strings.Builder
	root.SetArgs(args)
	root.SetOut(&out)
	root.SetErr(&errb)
	err = root.Execute()
	return code, out.String(), errb.String(), err
}

// The notify subcommand is exercised in depth in internal/notify; here we only
// prove the wiring: args, stderr, and exit code flow through cobra untouched.
func TestNotifyWiring_PropagatesExitAndStderr(t *testing.T) {
	code, _, stderr, err := execCmd(t, []string{"notify", "hi"}, "", noEnv)
	if err != nil {
		t.Fatalf("Execute returned a structural error: %v", err)
	}
	if code != 1 {
		t.Fatalf("exit = %d, want 1 (notify reports the missing token)", code)
	}
	if !strings.Contains(stderr, "TELEGRAM_BOT_TOKEN") {
		t.Errorf("stderr = %q, want the notify diagnostic (proves wiring)", stderr)
	}
}

func TestHelp_ListsNotify(t *testing.T) {
	code, stdout, _, err := execCmd(t, []string{"--help"}, "", noEnv)
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit = %d, want 0", code)
	}
	if !strings.Contains(stdout, "notify") {
		t.Errorf("help = %q, want it to list the notify subcommand", stdout)
	}
}

func TestUnknownSubcommand_Errors(t *testing.T) {
	_, _, _, err := execCmd(t, []string{"bogus"}, "", noEnv)
	if err == nil {
		t.Fatalf("Execute returned nil, want an error for an unknown subcommand")
	}
}

// The metrics-ingest paths are exercised in depth in internal/metrics; here we
// only prove the wiring: flags reach the package and a bad month flows back as a
// non-zero exit with the package's diagnostic on stderr.
func TestMetricsIngestLinkedInWiring_PropagatesExitAndStderr(t *testing.T) {
	code, _, stderr, err := execCmd(t, []string{
		"metrics-ingest", "linkedin", "--file", "nope.csv", "--month", "2026-13",
	}, "", noEnv)
	if err != nil {
		t.Fatalf("Execute returned a structural error: %v", err)
	}
	if code != 1 {
		t.Fatalf("exit = %d, want 1 (the package reports the bad month)", code)
	}
	if !strings.Contains(stderr, "month") {
		t.Errorf("stderr = %q, want the metrics diagnostic (proves wiring)", stderr)
	}
}

func TestMetricsIngestSiteWiring_PropagatesExitAndStderr(t *testing.T) {
	code, _, stderr, err := execCmd(t, []string{
		"metrics-ingest", "site", "--month", "2026-06",
	}, "", noEnv)
	if err != nil {
		t.Fatalf("Execute returned a structural error: %v", err)
	}
	if code != 1 {
		t.Fatalf("exit = %d, want 1 (site refuses an empty snapshot)", code)
	}
	if !strings.Contains(stderr, "empty") {
		t.Errorf("stderr = %q, want the empty-snapshot diagnostic (proves wiring)", stderr)
	}
}

// TestMetricsIngestLinkedIn_GoldenThroughSubcommand runs the golden sample all
// the way through the cobra subcommand (flags → package → file), so the seam's
// classic test also holds at the invocation the spec names.
func TestMetricsIngestLinkedIn_GoldenThroughSubcommand(t *testing.T) {
	dir := t.TempDir()
	code, _, stderr, err := execCmd(t, []string{
		"metrics-ingest", "linkedin",
		"--file", filepath.Join(testdataDir, "linkedin-sample.csv"),
		"--month", "2026-06",
		"--metrics-dir", dir,
	}, "", noEnv)
	if err != nil {
		t.Fatalf("Execute returned a structural error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr)
	}
	got, err := os.ReadFile(filepath.Join(dir, "2026-06", "linkedin-posts.csv"))
	if err != nil {
		t.Fatalf("reading output: %v", err)
	}
	want, err := os.ReadFile(filepath.Join(testdataDir, "linkedin-posts.golden.csv"))
	if err != nil {
		t.Fatalf("reading golden: %v", err)
	}
	if string(got) != string(want) {
		t.Errorf("normalized output mismatch through subcommand:\n got: %q\nwant: %q", got, want)
	}
}

func TestMetricsIngestLinkedIn_RequiresFileAndMonth(t *testing.T) {
	_, _, _, err := execCmd(t, []string{"metrics-ingest", "linkedin"}, "", noEnv)
	if err == nil {
		t.Fatalf("Execute returned nil, want an error for the missing required flags")
	}
}

func TestHelp_ListsMetricsIngest(t *testing.T) {
	code, stdout, _, err := execCmd(t, []string{"--help"}, "", noEnv)
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit = %d, want 0", code)
	}
	if !strings.Contains(stdout, "metrics-ingest") {
		t.Errorf("help = %q, want it to list the metrics-ingest subcommand", stdout)
	}
}

// The idea-create path is exercised in depth in internal/idea; here we prove the
// wiring: cobra routes `idea create`, hands the spark to the seam verbatim (even
// with a leading '-', since flag parsing is disabled), and echoes gh's URL.
func TestIdeaCreateWiring_FilesThroughGH(t *testing.T) {
	var gotName string
	var gotArgs []string
	run := func(name string, args ...string) (string, string, error) {
		gotName, gotArgs = name, args
		return "https://github.com/davideimola/content-os/issues/99\n", "", nil
	}

	code, stdout, stderr, err := execCmdWithRunner(t,
		[]string{"idea", "create", "-dashy spark that is not a flag"}, "", noEnv, run)

	if err != nil {
		t.Fatalf("Execute returned a structural error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr)
	}
	if gotName != "gh" {
		t.Errorf("ran %q, want gh", gotName)
	}
	if !contains(gotArgs, "--label", "idea") {
		t.Errorf("args = %v, want --label idea", gotArgs)
	}
	if !contains(gotArgs, "--body", "-dashy spark that is not a flag") {
		t.Errorf("args = %v, want the spark passed through verbatim as --body", gotArgs)
	}
	if !strings.Contains(stdout, "issues/99") {
		t.Errorf("stdout = %q, want the new issue URL echoed", stdout)
	}
}

// contains reports whether args holds flag immediately followed by value.
func contains(args []string, flag, value string) bool {
	for i, a := range args {
		if a == flag && i+1 < len(args) && args[i+1] == value {
			return true
		}
	}
	return false
}

func TestIdeaCreateWiring_EmptyDumpRefused(t *testing.T) {
	// Empty stdin, no args: refused before the seam, so unusedRunner proves gh is
	// never reached while the exit code and diagnostic flow back through cobra.
	code, _, stderr, err := execCmd(t, []string{"idea", "create"}, "", noEnv)
	if err != nil {
		t.Fatalf("Execute returned a structural error: %v", err)
	}
	if code != 1 {
		t.Fatalf("exit = %d, want 1 (empty idea refused)", code)
	}
	if !strings.Contains(stderr, "empty idea") {
		t.Errorf("stderr = %q, want the empty-idea diagnostic (proves wiring)", stderr)
	}
}

func TestHelp_ListsIdea(t *testing.T) {
	code, stdout, _, err := execCmd(t, []string{"--help"}, "", noEnv)
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit = %d, want 0", code)
	}
	if !strings.Contains(stdout, "idea") {
		t.Errorf("help = %q, want it to list the idea subcommand", stdout)
	}
}
