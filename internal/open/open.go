// Package open implements `contentos open`: utility shortcuts that open the
// Content OS destinations — the Calendar board, Pipeline views, a specific
// issue, the Beats workflow — in the default browser. Hands, not brain
// (ADR-0003): it only resolves a fixed URL and hands it to the OS opener.
//
// With a target it opens directly; with no target it picks interactively —
// through `fzf` when it is installed, otherwise a numbered stdin menu. The
// browser launch (Opener) and the interactive pick (Picker) are injected seams
// so tests assert the resolved URL without opening a browser or an fzf UI.
// See docs/agents/open.md.
package open

import (
	"bufio"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

const (
	repo    = "davideimola/content-os" // the Pipeline's home (ADR-0001)
	owner   = "davideimola"
	project = "2" // the Calendar board (docs/agents/calendar.md)

	ghRepo = "https://github.com/" + repo
	ghProj = "https://github.com/users/" + owner + "/projects/" + project
)

// target is a named browser destination.
type target struct {
	name, desc, url string
}

// targets is the fixed menu of destinations, in menu order.
func targets() []target {
	issues := ghRepo + "/issues"
	q := func(query string) string { return issues + "?q=" + url.QueryEscape(query) }
	return []target{
		{"board", "the Calendar board (GitHub Projects)", ghProj},
		{"pipeline", "all open Pipeline issues", q("is:issue is:open")},
		{"ideas", "the Idea inbox", q("is:issue is:open label:idea")},
		{"proposed", "proposed pieces", q("is:issue is:open label:proposed")},
		{"slotted", "slotted pieces", q("is:issue is:open label:slotted")},
		{"talks", "talks & CFP", q("is:issue is:open label:talk")},
		{"blog", "blog pieces", q("is:issue is:open label:blog")},
		{"beats", "the Beats workflow runs (Actions)", ghRepo + "/actions/workflows/beats.yml"},
		{"repo", "the content-os repo", ghRepo},
	}
}

// Completions returns the shell-completion candidates for the first argument,
// as "name\tdescription" lines (Cobra renders the description). With fzf-tab
// this is a fuzzy picker over the targets.
func Completions() []string {
	ts := targets()
	out := make([]string, 0, len(ts)+1)
	for _, t := range ts {
		out = append(out, t.name+"\t"+t.desc)
	}
	return append(out, "issue\topen a specific issue by number")
}

// Opener launches the default browser for a URL. Tests substitute a fake.
type Opener func(url string) error

// Picker chooses one entry from labels interactively, returning its index or
// cancelled. Production (SystemPicker) uses fzf when present, else the numbered
// stdin menu; tests inject a fake or NumberedMenu directly.
type Picker func(labels []string, stdin io.Reader, stdout io.Writer) (idx int, cancelled bool, err error)

// Run resolves the destination from args (or the interactive picker when there
// are none) and opens it, returning a process exit code: 0 on success (the
// opened URL is echoed to stdout), non-zero (with a reason on stderr) otherwise.
//
// Forms: `open <target>`, `open issue <n>`, `open <n>` (bare number → that
// issue), or `open` with no args → the interactive picker.
func Run(args []string, stdin io.Reader, stdout, stderr io.Writer, open Opener, pick Picker) int {
	fail := func(msg string) int {
		fmt.Fprintf(stderr, "contentos open: %s\n", msg)
		return 1
	}
	ts := targets()

	var dest, label string
	switch {
	case len(args) == 0:
		labels := make([]string, len(ts))
		for i, t := range ts {
			labels[i] = fmt.Sprintf("%-9s %s", t.name, t.desc)
		}
		i, cancelled, err := pick(labels, stdin, stdout)
		if err != nil {
			return fail(err.Error())
		}
		if cancelled {
			return 0
		}
		dest, label = ts[i].url, ts[i].name

	case args[0] == "issue":
		if len(args) < 2 {
			return fail("usage: contentos open issue <number>")
		}
		d, l, err := issueURL(args[1])
		if err != nil {
			return fail(err.Error())
		}
		dest, label = d, l

	default:
		// A bare number is a shortcut for that issue; otherwise a named target.
		if _, convErr := strconv.Atoi(args[0]); convErr == nil {
			d, l, err := issueURL(args[0])
			if err != nil {
				return fail(err.Error())
			}
			dest, label = d, l
		} else if t := find(ts, args[0]); t != nil {
			dest, label = t.url, t.name
		} else {
			return fail(fmt.Sprintf("unknown target %q — run `contentos open` for the menu", args[0]))
		}
	}

	if err := open(dest); err != nil {
		return fail(fmt.Sprintf("could not open the browser: %v", err))
	}
	fmt.Fprintf(stdout, "opening %s → %s\n", label, dest)
	return 0
}

// issueURL builds the URL for a specific issue, validating the number.
func issueURL(s string) (dest, label string, err error) {
	n, convErr := strconv.Atoi(s)
	if convErr != nil || n <= 0 {
		return "", "", fmt.Errorf("not an issue number: %q", s)
	}
	return fmt.Sprintf("%s/issues/%d", ghRepo, n), fmt.Sprintf("issue #%d", n), nil
}

func find(ts []target, name string) *target {
	for i := range ts {
		if ts[i].name == name {
			return &ts[i]
		}
	}
	return nil
}

// SystemPicker is the production Picker: fzf when it is on PATH (a real fuzzy
// finder over the destinations), otherwise the numbered stdin menu.
func SystemPicker(labels []string, stdin io.Reader, stdout io.Writer) (int, bool, error) {
	if _, err := exec.LookPath("fzf"); err == nil {
		return fzfPick(labels)
	}
	return NumberedMenu(labels, stdin, stdout)
}

// fzfPick pipes the labels into fzf and maps the chosen line back to its index.
// fzf draws its UI on the controlling terminal (/dev/tty) via stderr; ESC/cancel
// is fzf's exit code 130.
func fzfPick(labels []string) (int, bool, error) {
	cmd := exec.Command("fzf", "--height=40%", "--reverse", "--prompt=open> ")
	cmd.Stdin = strings.NewReader(strings.Join(labels, "\n"))
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() == 130 {
			return 0, true, nil // ESC / cancelled
		}
		return 0, false, fmt.Errorf("fzf: %w", err)
	}
	choice := strings.TrimRight(string(out), "\n")
	for i, l := range labels {
		if l == choice {
			return i, false, nil
		}
	}
	return 0, true, nil // no match → treat as cancel
}

// NumberedMenu prints the labels numbered and reads a choice from stdin. A blank
// line cancels; an out-of-range or non-numeric entry is an error. It is the
// fallback Picker when fzf is absent, and the one the tests drive.
func NumberedMenu(labels []string, stdin io.Reader, stdout io.Writer) (int, bool, error) {
	fmt.Fprintln(stdout, "Open in the browser:")
	for i, l := range labels {
		fmt.Fprintf(stdout, "  %2d) %s\n", i+1, l)
	}
	fmt.Fprint(stdout, "Choice (number, or blank to cancel): ")

	line, readErr := bufio.NewReader(stdin).ReadString('\n')
	if readErr != nil && readErr != io.EOF {
		return 0, false, fmt.Errorf("could not read the choice: %w", readErr)
	}
	line = strings.TrimSpace(line)
	if line == "" {
		return 0, true, nil
	}
	n, convErr := strconv.Atoi(line)
	if convErr != nil || n < 1 || n > len(labels) {
		return 0, false, fmt.Errorf("not a valid choice: %q", line)
	}
	return n - 1, false, nil
}

// System is the production Opener: it launches the platform's default browser.
func System(dest string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", dest)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", dest)
	default:
		cmd = exec.Command("xdg-open", dest)
	}
	return cmd.Run()
}
