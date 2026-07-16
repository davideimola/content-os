// Package metrics implements the `contentos metrics-ingest` subcommand: it turns
// the raw monthly inputs — a LinkedIn per-post export (CSV) and manually reported
// site numbers — into normalized, versioned plain-text files under the repo's
// metrics area (metrics/<YYYY-MM>/). The monthly review Beat reads only this
// normalized form; the raw export never enters the repo.
//
// It is the Content OS "metrics-ingest" seam (see docs/agents/metrics-ingest.md
// and ADR-0003): hands, not brain. The transform is deterministic and
// idempotent — re-running on the same input produces byte-identical output — so
// month-over-month git diffs reflect real data changes, not reformatting noise.
package metrics

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// linkedinColumns is the canonical column order of both the input contract and
// the normalized output. Input columns may appear in any order (matched by
// header name) with extra columns ignored; output always uses this order.
var linkedinColumns = []string{"date", "post_url", "impressions", "reactions", "comments", "reshares"}

// monthRe matches the YYYY-MM folder key that versions each monthly snapshot.
var monthRe = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// post is one normalized LinkedIn post row: the source facts only, canonicalized.
// Derived measures (e.g. engagement rate) are computed by the review, not stored,
// so the versioned data stays purely factual.
type post struct {
	date        string // canonical YYYY-MM-DD
	url         string
	impressions int
	reactions   int
	comments    int
	reshares    int
}

// RunLinkedIn parses the LinkedIn export CSV and writes its normalized form to
// metrics/<month>/linkedin-posts.csv, returning a process exit code: 0 on
// success, non-zero (with a clear line on stderr) otherwise.
func RunLinkedIn(file, month, metricsDir string, stdout, stderr io.Writer) int {
	fail := failer(stderr, "linkedin")

	if err := validateMonth(month); err != nil {
		return fail(err.Error())
	}
	f, err := os.Open(file)
	if err != nil {
		return fail(fmt.Sprintf("could not open the export: %v", err))
	}
	defer f.Close()

	posts, err := parseLinkedInCSV(f)
	if err != nil {
		return fail(fmt.Sprintf("in %s: %v", file, err))
	}
	out, err := normalizeLinkedIn(posts)
	if err != nil {
		return fail(err.Error())
	}
	dest := linkedinPostsPath(metricsDir, month)
	if err := writeFile(dest, out); err != nil {
		return fail(err.Error())
	}
	fmt.Fprintf(stdout, "wrote %s (%d posts)\n", dest, len(posts))
	return 0
}

// RunSite normalizes manually reported site numbers and writes them to
// metrics/<month>/site.csv in the same plain-text form. visitors and pageViews
// are the two core Vercel Analytics counts, each nil when not supplied; at least
// one is required. Returns a process exit code.
func RunSite(month, metricsDir string, visitors, pageViews *int, stdout, stderr io.Writer) int {
	fail := failer(stderr, "site")

	if err := validateMonth(month); err != nil {
		return fail(err.Error())
	}
	values, err := siteMetrics(visitors, pageViews)
	if err != nil {
		return fail(err.Error())
	}
	if len(values) == 0 {
		return fail("refusing to write an empty site.csv — pass --visitors and/or --page-views.")
	}
	out, err := normalizeSite(values)
	if err != nil {
		return fail(err.Error())
	}
	dest := sitePath(metricsDir, month)
	if err := writeFile(dest, out); err != nil {
		return fail(err.Error())
	}
	fmt.Fprintf(stdout, "wrote %s (%d metrics)\n", dest, len(values))
	return 0
}

// parseLinkedInCSV reads the LinkedIn per-post export and returns validated
// posts. Columns are matched by header name (any order); extra columns are
// ignored. Every required column must be present, dates must be real YYYY-MM-DD,
// and counts must be non-negative integers — anything else is a named error.
func parseLinkedInCSV(r io.Reader) ([]post, error) {
	cr := csv.NewReader(r)
	cr.TrimLeadingSpace = true
	records, err := cr.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("could not read the CSV: %w", err)
	}
	if len(records) == 0 {
		return nil, errors.New("the CSV is empty (no header row)")
	}

	idx := map[string]int{}
	for i, name := range records[0] {
		key := strings.ToLower(strings.TrimSpace(name))
		if key == "" {
			continue
		}
		if _, dup := idx[key]; dup {
			return nil, fmt.Errorf("duplicate column %q in the header", key)
		}
		idx[key] = i
	}
	for _, col := range linkedinColumns {
		if _, ok := idx[col]; !ok {
			return nil, fmt.Errorf("missing required column %q (need: %s)", col, strings.Join(linkedinColumns, ", "))
		}
	}

	posts := make([]post, 0, len(records)-1)
	for i, rec := range records[1:] {
		line := i + 2 // 1-based, past the header row
		field := func(col string) string { return strings.TrimSpace(rec[idx[col]]) }

		raw := field("date")
		d, err := time.Parse("2006-01-02", raw)
		if err != nil {
			return nil, fmt.Errorf("row %d: date %q is not a valid YYYY-MM-DD date", line, raw)
		}
		url := field("post_url")
		if url == "" {
			return nil, fmt.Errorf("row %d: post_url is empty", line)
		}
		count := func(col string) (int, error) {
			s := field(col)
			n, err := strconv.Atoi(s)
			if err != nil {
				return 0, fmt.Errorf("row %d: %s %q is not an integer", line, col, s)
			}
			if n < 0 {
				return 0, fmt.Errorf("row %d: %s %d is negative", line, col, n)
			}
			return n, nil
		}
		imp, err := count("impressions")
		if err != nil {
			return nil, err
		}
		rea, err := count("reactions")
		if err != nil {
			return nil, err
		}
		com, err := count("comments")
		if err != nil {
			return nil, err
		}
		res, err := count("reshares")
		if err != nil {
			return nil, err
		}
		posts = append(posts, post{
			date:        d.Format("2006-01-02"), // canonicalize padding
			url:         url,
			impressions: imp,
			reactions:   rea,
			comments:    com,
			reshares:    res,
		})
	}
	return posts, nil
}

// normalizeLinkedIn renders posts to the canonical normalized CSV: fixed column
// order, sorted by date then URL. Deterministic — the same posts always produce
// the same bytes.
func normalizeLinkedIn(posts []post) ([]byte, error) {
	sorted := make([]post, len(posts))
	copy(sorted, posts)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].date != sorted[j].date {
			return sorted[i].date < sorted[j].date
		}
		return sorted[i].url < sorted[j].url
	})

	rows := make([][]string, 0, len(sorted))
	for _, p := range sorted {
		rows = append(rows, []string{
			p.date, p.url,
			strconv.Itoa(p.impressions), strconv.Itoa(p.reactions),
			strconv.Itoa(p.comments), strconv.Itoa(p.reshares),
		})
	}
	return writeCSV(linkedinColumns, rows)
}

// normalizeSite renders metric/value pairs to canonical CSV, sorted by metric
// name for a stable diff. Deterministic, matching normalizeLinkedIn.
func normalizeSite(values map[string]string) ([]byte, error) {
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	rows := make([][]string, 0, len(keys))
	for _, k := range keys {
		rows = append(rows, []string{k, values[k]})
	}
	return writeCSV([]string{"metric", "value"}, rows)
}

// writeCSV serializes header + rows to canonical CSV bytes (LF line endings,
// csv-standard quoting). Shared by both normalizers so their output is identical
// in shape and deterministic.
func writeCSV(header []string, rows [][]string) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(header); err != nil {
		return nil, err
	}
	for _, row := range rows {
		if err := w.Write(row); err != nil {
			return nil, err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// siteMetrics folds the two core count flags into one metric->value map,
// rejecting negatives so the normalized file is always clean.
func siteMetrics(visitors, pageViews *int) (map[string]string, error) {
	values := map[string]string{}
	if visitors != nil {
		if *visitors < 0 {
			return nil, fmt.Errorf("visitors %d is negative", *visitors)
		}
		values["visitors"] = strconv.Itoa(*visitors)
	}
	if pageViews != nil {
		if *pageViews < 0 {
			return nil, fmt.Errorf("page_views %d is negative", *pageViews)
		}
		values["page_views"] = strconv.Itoa(*pageViews)
	}
	return values, nil
}

// validateMonth enforces the YYYY-MM snapshot key (real month, 01-12).
func validateMonth(month string) error {
	if !monthRe.MatchString(month) {
		return fmt.Errorf("month %q must be YYYY-MM (e.g. 2026-06)", month)
	}
	return nil
}

// linkedinPostsPath is where a month's normalized LinkedIn posts are written.
func linkedinPostsPath(metricsDir, month string) string {
	return filepath.Join(metricsDir, month, "linkedin-posts.csv")
}

// sitePath is where a month's normalized site numbers are written.
func sitePath(metricsDir, month string) string {
	return filepath.Join(metricsDir, month, "site.csv")
}

// writeFile writes content to path, creating parent directories, overwriting any
// existing file so a re-run replaces the snapshot wholesale.
func writeFile(path string, content []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create %s: %w", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("could not write %s: %w", path, err)
	}
	return nil
}

// failer returns a helper that prints a one-line diagnostic under the
// subcommand's name and yields exit code 1, mirroring the notify seam's contract.
func failer(stderr io.Writer, sub string) func(string) int {
	return func(msg string) int {
		fmt.Fprintf(stderr, "contentos metrics-ingest %s: %s\n", sub, msg)
		return 1
	}
}
