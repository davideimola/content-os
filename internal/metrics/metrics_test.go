package metrics

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func intp(n int) *int { return &n }

// readFile is a test helper that reads a produced or golden file or fails.
func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	return string(b)
}

// TestRunLinkedIn_GoldenSample is the seam's classic test (spec, issue #1):
// a sample export produces the expected normalized output, end to end through
// the file-writing path. The sample deliberately has free column order, an extra
// ignored column, and unsorted rows — so passing proves normalization does real
// work, not a passthrough.
func TestRunLinkedIn_GoldenSample(t *testing.T) {
	dir := t.TempDir()
	var stderr strings.Builder

	code := RunLinkedIn("testdata/linkedin-sample.csv", "2026-06", dir, io.Discard, &stderr)

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	got := readFile(t, filepath.Join(dir, "2026-06", "linkedin-posts.csv"))
	want := readFile(t, filepath.Join("testdata", "linkedin-posts.golden.csv"))
	if got != want {
		t.Errorf("normalized output mismatch:\n got: %q\nwant: %q", got, want)
	}
}

// TestRunLinkedIn_Idempotent proves re-running on the same input is idempotent
// (acceptance criterion): the second write is byte-identical to the first.
func TestRunLinkedIn_Idempotent(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "2026-06", "linkedin-posts.csv")

	if code := RunLinkedIn("testdata/linkedin-sample.csv", "2026-06", dir, io.Discard, io.Discard); code != 0 {
		t.Fatalf("first run exit = %d, want 0", code)
	}
	first := readFile(t, out)

	if code := RunLinkedIn("testdata/linkedin-sample.csv", "2026-06", dir, io.Discard, io.Discard); code != 0 {
		t.Fatalf("second run exit = %d, want 0", code)
	}
	second := readFile(t, out)

	if first != second {
		t.Errorf("output not idempotent:\nfirst:  %q\nsecond: %q", first, second)
	}
}

// TestNormalizeLinkedIn_FixedPoint proves the normalized form is a fixed point:
// feeding the golden output back through parse+normalize yields itself. This is
// what makes month-over-month diffs meaningful.
func TestNormalizeLinkedIn_FixedPoint(t *testing.T) {
	golden := readFile(t, filepath.Join("testdata", "linkedin-posts.golden.csv"))

	posts, err := parseLinkedInCSV(strings.NewReader(golden))
	if err != nil {
		t.Fatalf("re-parsing golden output: %v", err)
	}
	out, err := normalizeLinkedIn(posts)
	if err != nil {
		t.Fatalf("re-normalizing: %v", err)
	}
	if string(out) != golden {
		t.Errorf("golden output is not a fixed point:\n got: %q\nwant: %q", out, golden)
	}
}

func TestParseLinkedInCSV_MissingRequiredColumn(t *testing.T) {
	// impressions is required but absent.
	in := "date,post_url,reactions,comments,reshares\n2026-06-03,https://x,1,2,3\n"
	_, err := parseLinkedInCSV(strings.NewReader(in))
	if err == nil {
		t.Fatal("err = nil, want a missing-column error")
	}
	if !strings.Contains(err.Error(), "impressions") {
		t.Errorf("err = %q, want it to name the missing column", err)
	}
}

func TestParseLinkedInCSV_NonIntegerValue(t *testing.T) {
	in := "date,post_url,impressions,reactions,comments,reshares\n2026-06-03,https://x,lots,2,3,4\n"
	_, err := parseLinkedInCSV(strings.NewReader(in))
	if err == nil {
		t.Fatal("err = nil, want a non-integer error")
	}
	if !strings.Contains(err.Error(), "impressions") {
		t.Errorf("err = %q, want it to name the offending column", err)
	}
}

func TestParseLinkedInCSV_NegativeValue(t *testing.T) {
	in := "date,post_url,impressions,reactions,comments,reshares\n2026-06-03,https://x,-1,2,3,4\n"
	_, err := parseLinkedInCSV(strings.NewReader(in))
	if err == nil {
		t.Fatal("err = nil, want a negative-value error")
	}
}

func TestParseLinkedInCSV_MissingDate(t *testing.T) {
	in := "date,post_url,impressions,reactions,comments,reshares\n,https://x,10,2,3,4\n"
	_, err := parseLinkedInCSV(strings.NewReader(in))
	if err == nil {
		t.Fatal("err = nil, want an empty-date error")
	}
}

func TestParseLinkedInCSV_BadDate(t *testing.T) {
	in := "date,post_url,impressions,reactions,comments,reshares\n06/03/2026,https://x,10,2,3,4\n"
	_, err := parseLinkedInCSV(strings.NewReader(in))
	if err == nil {
		t.Fatal("err = nil, want a bad-date error")
	}
}

func TestRunLinkedIn_MissingFile(t *testing.T) {
	dir := t.TempDir()
	var stderr strings.Builder
	code := RunLinkedIn(filepath.Join(dir, "nope.csv"), "2026-06", dir, io.Discard, &stderr)
	if code == 0 {
		t.Fatal("exit = 0, want non-zero for a missing file")
	}
	if stderr.Len() == 0 {
		t.Error("stderr is empty, want a diagnostic")
	}
}

func TestRunLinkedIn_BadMonth(t *testing.T) {
	dir := t.TempDir()
	var stderr strings.Builder
	code := RunLinkedIn("testdata/linkedin-sample.csv", "2026-13", dir, io.Discard, &stderr)
	if code == 0 {
		t.Fatal("exit = 0, want non-zero for an invalid month")
	}
	if !strings.Contains(stderr.String(), "month") {
		t.Errorf("stderr = %q, want it to name the month problem", stderr.String())
	}
}

// TestRunSite_Golden covers the manual site path: the two core numbers entered
// as flags land in the same normalized form (plain-text CSV under
// metrics/<month>/), sorted by metric name for a stable diff.
func TestRunSite_Golden(t *testing.T) {
	dir := t.TempDir()
	var stderr strings.Builder

	code := RunSite("2026-06", dir, intp(1234), intp(5678), io.Discard, &stderr)

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	got := readFile(t, filepath.Join(dir, "2026-06", "site.csv"))
	want := "metric,value\npage_views,5678\nvisitors,1234\n"
	if got != want {
		t.Errorf("site output mismatch:\n got: %q\nwant: %q", got, want)
	}
}

func TestRunSite_Idempotent(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "2026-06", "site.csv")

	if code := RunSite("2026-06", dir, intp(1234), intp(5678), io.Discard, io.Discard); code != 0 {
		t.Fatalf("first run exit = %d, want 0", code)
	}
	first := readFile(t, out)
	if code := RunSite("2026-06", dir, intp(1234), intp(5678), io.Discard, io.Discard); code != 0 {
		t.Fatalf("second run exit = %d, want 0", code)
	}
	second := readFile(t, out)
	if first != second {
		t.Errorf("site output not idempotent:\nfirst:  %q\nsecond: %q", first, second)
	}
}

// TestRunSite_PartialInput proves either core number alone is enough.
func TestRunSite_PartialInput(t *testing.T) {
	dir := t.TempDir()
	code := RunSite("2026-06", dir, intp(1234), nil, io.Discard, io.Discard)
	if code != 0 {
		t.Fatalf("exit = %d, want 0 with only --visitors", code)
	}
	got := readFile(t, filepath.Join(dir, "2026-06", "site.csv"))
	want := "metric,value\nvisitors,1234\n"
	if got != want {
		t.Errorf("site output mismatch:\n got: %q\nwant: %q", got, want)
	}
}

func TestRunSite_RefusesEmpty(t *testing.T) {
	dir := t.TempDir()
	var stderr strings.Builder
	code := RunSite("2026-06", dir, nil, nil, io.Discard, &stderr)
	if code == 0 {
		t.Fatal("exit = 0, want non-zero when no metrics are given")
	}
	if _, err := os.Stat(filepath.Join(dir, "2026-06", "site.csv")); !os.IsNotExist(err) {
		t.Error("site.csv was written despite no metrics")
	}
}

func TestRunSite_NegativeValue(t *testing.T) {
	dir := t.TempDir()
	var stderr strings.Builder
	code := RunSite("2026-06", dir, intp(-1), nil, io.Discard, &stderr)
	if code == 0 {
		t.Fatal("exit = 0, want non-zero for a negative count")
	}
}

func TestRunSite_BadMonth(t *testing.T) {
	dir := t.TempDir()
	var stderr strings.Builder
	code := RunSite("nope", dir, intp(10), nil, io.Discard, &stderr)
	if code == 0 {
		t.Fatal("exit = 0, want non-zero for an invalid month")
	}
	if !strings.Contains(stderr.String(), "month") {
		t.Errorf("stderr = %q, want it to name the month problem", stderr.String())
	}
}
