package idea

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

// call records one invocation of the fake Commander so a test can assert what
// the seam would have handed to `gh`.
type call struct {
	name string
	args []string
}

// fakeCommander returns a Commander that records its single invocation into rec
// and replies with the given stdout, stderr, and error — no `gh`, no network.
func fakeCommander(rec *call, stdout, stderr string, err error) Commander {
	return func(name string, args ...string) (string, string, error) {
		rec.name = name
		rec.args = args
		return stdout, stderr, err
	}
}

// refusingCommander fails the test if the seam is ever reached — used to prove
// the refusal paths never touch GitHub.
func refusingCommander(t *testing.T) Commander {
	t.Helper()
	return func(name string, args ...string) (string, string, error) {
		t.Fatalf("gh was invoked (%s %v) but the call should have been refused", name, args)
		return "", "", nil
	}
}

// flagValue returns the value following the first occurrence of flag in args.
func flagValue(t *testing.T, args []string, flag string) string {
	t.Helper()
	for i, a := range args {
		if a == flag {
			if i+1 >= len(args) {
				t.Fatalf("flag %q has no value in %v", flag, args)
			}
			return args[i+1]
		}
	}
	t.Fatalf("flag %q not found in %v", flag, args)
	return ""
}

func hasArg(args []string, want string) bool {
	return slices.Contains(args, want)
}

// errReader fails on read, standing in for a broken stdin.
type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("boom") }

func TestRun_HappyPath_Args(t *testing.T) {
	rec := &call{}
	url := "https://github.com/davideimola/content-os/issues/17"
	var stdout, stderr strings.Builder

	code := Run([]string{"the", "thing", "nobody", "tells", "you"},
		strings.NewReader(""), &stdout, &stderr, fakeCommander(rec, url+"\n", "", nil))

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	if rec.name != "gh" {
		t.Errorf("ran %q, want gh", rec.name)
	}
	if !hasArg(rec.args, "issue") || !hasArg(rec.args, "create") {
		t.Errorf("args = %v, want an `issue create`", rec.args)
	}
	if got := flagValue(t, rec.args, "--repo"); got != "davideimola/content-os" {
		t.Errorf("--repo = %q, want davideimola/content-os", got)
	}
	if got := flagValue(t, rec.args, "--label"); got != "idea" {
		t.Errorf("--label = %q, want idea", got)
	}
	if got := flagValue(t, rec.args, "--body"); got != "the thing nobody tells you" {
		t.Errorf("--body = %q, want the args joined with spaces", got)
	}
	if got := flagValue(t, rec.args, "--title"); !strings.HasPrefix(got, "[Idea] ") {
		t.Errorf("--title = %q, want the [Idea] prefix", got)
	}
	if !strings.Contains(stdout.String(), url) {
		t.Errorf("stdout = %q, want the new issue URL echoed", stdout.String())
	}
}

func TestRun_HappyPath_Stdin(t *testing.T) {
	rec := &call{}
	var stdout, stderr strings.Builder

	code := Run(nil, strings.NewReader("a piped spark\n"), &stdout, &stderr,
		fakeCommander(rec, "https://example/issues/1\n", "", nil))

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	if got := flagValue(t, rec.args, "--body"); got != "a piped spark" {
		t.Errorf("--body = %q, want the stdin spark with the trailing newline trimmed", got)
	}
}

func TestRun_TitleFromFirstNonEmptyLine(t *testing.T) {
	rec := &call{}
	var stdout, stderr strings.Builder
	spark := "\n\n  Running agents against real attacker traffic  \nmore detail on the next line\n"

	code := Run(nil, strings.NewReader(spark), &stdout, &stderr,
		fakeCommander(rec, "https://example/issues/2", "", nil))

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	if got := flagValue(t, rec.args, "--title"); got != "[Idea] Running agents against real attacker traffic" {
		t.Errorf("--title = %q, want the first non-empty line, trimmed, behind the prefix", got)
	}
	// The body keeps the full spark verbatim (only the trailing newline trimmed).
	if got := flagValue(t, rec.args, "--body"); got != strings.TrimRight(spark, "\r\n") {
		t.Errorf("--body = %q, want the full spark verbatim", got)
	}
}

func TestRun_TitleTruncatedOnRuneBoundary(t *testing.T) {
	rec := &call{}
	var stdout, stderr strings.Builder
	// A long single line of multi-byte runes: truncation must not split a rune
	// and must stay within the cap.
	line := strings.Repeat("è", 200)

	code := Run([]string{line}, strings.NewReader(""), &stdout, &stderr,
		fakeCommander(rec, "https://example/issues/3", "", nil))

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	title := flagValue(t, rec.args, "--title")
	summary := strings.TrimPrefix(title, "[Idea] ")
	if !strings.HasSuffix(summary, "…") {
		t.Errorf("title = %q, want a truncated summary ending in an ellipsis", title)
	}
	if n := len([]rune(summary)); n > maxTitleRunes {
		t.Errorf("summary rune length = %d, want <= %d", n, maxTitleRunes)
	}
	if !strings.ContainsRune(summary, 'è') || strings.Contains(summary, "�") {
		t.Errorf("summary = %q, want intact multi-byte runes (no replacement char)", summary)
	}
	// The body still carries the whole line, untouched by the title cap.
	if got := flagValue(t, rec.args, "--body"); got != line {
		t.Errorf("--body was truncated; want the full spark")
	}
}

func TestRun_EmptySpark_Refused(t *testing.T) {
	var stdout, stderr strings.Builder

	code := Run(nil, strings.NewReader(""), &stdout, &stderr, refusingCommander(t))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero for an empty spark")
	}
	if !strings.Contains(stderr.String(), "empty idea") {
		t.Errorf("stderr = %q, want it to refuse an empty idea", stderr.String())
	}
}

func TestRun_WhitespaceSpark_Refused(t *testing.T) {
	var stdout, stderr strings.Builder

	code := Run(nil, strings.NewReader("   \n\t\n"), &stdout, &stderr, refusingCommander(t))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero for a whitespace-only spark")
	}
	if !strings.Contains(stderr.String(), "empty idea") {
		t.Errorf("stderr = %q, want it to refuse an empty idea", stderr.String())
	}
}

func TestRun_EmptyArg_Refused(t *testing.T) {
	var stdout, stderr strings.Builder

	code := Run([]string{""}, strings.NewReader(""), &stdout, &stderr, refusingCommander(t))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero for an explicit empty argument")
	}
}

func TestRun_GHFailure_SurfacesStderr(t *testing.T) {
	rec := &call{}
	var stdout, stderr strings.Builder

	code := Run([]string{"hi"}, strings.NewReader(""), &stdout, &stderr,
		fakeCommander(rec, "", "could not find label \"idea\"", errors.New("exit status 1")))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero when gh fails")
	}
	s := stderr.String()
	if !strings.Contains(s, "could not find label") {
		t.Errorf("stderr = %q, want gh's own diagnostic surfaced", s)
	}
	if !strings.Contains(s, "gh issue create failed") {
		t.Errorf("stderr = %q, want the failure prefix", s)
	}
}

func TestRun_GHFailure_FallsBackToError(t *testing.T) {
	rec := &call{}
	var stdout, stderr strings.Builder

	// gh could not even start (no stderr): the run error itself must be surfaced.
	code := Run([]string{"hi"}, strings.NewReader(""), &stdout, &stderr,
		fakeCommander(rec, "", "", errors.New(`exec: "gh": executable file not found in $PATH`)))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero when gh cannot run")
	}
	if !strings.Contains(stderr.String(), "executable file not found") {
		t.Errorf("stderr = %q, want the run error surfaced when there is no gh stderr", stderr.String())
	}
}

func TestRun_StdinReadError(t *testing.T) {
	var stdout, stderr strings.Builder

	code := Run(nil, errReader{}, &stdout, &stderr, refusingCommander(t))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero on a stdin read error")
	}
	if strings.Contains(stderr.String(), "empty idea") {
		t.Errorf("stderr = %q, want a read-error diagnostic, not the empty-idea one", stderr.String())
	}
}

func TestRun_BodyIsVerbatim_IncludingLeadingDash(t *testing.T) {
	rec := &call{}
	var stdout, stderr strings.Builder
	// A spark that begins with '-' and spans lines must reach gh untouched.
	spark := "-not a flag\nsecond line"

	code := Run([]string{spark}, strings.NewReader(""), &stdout, &stderr,
		fakeCommander(rec, "https://example/issues/4", "", nil))

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	if got := flagValue(t, rec.args, "--body"); got != spark {
		t.Errorf("--body = %q, want the spark verbatim", got)
	}
}
