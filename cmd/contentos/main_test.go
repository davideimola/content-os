package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// testdataDir points at the metrics package's fixtures from this package's dir.
var testdataDir = filepath.Join("..", "..", "internal", "metrics", "testdata")

func noEnv(string) string { return "" }

// execCmd drives the command tree with args and captured IO, returning the
// subcommand exit code, stdout, stderr, and any structural error from Execute.
func execCmd(t *testing.T, args []string, stdin string, getenv func(string) string) (code int, stdout, stderr string, err error) {
	t.Helper()
	root := newRootCmd(strings.NewReader(stdin), getenv, &code)
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
