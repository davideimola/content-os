// Package open implements `contentos open`: utility shortcuts that open the
// Content OS destinations — the Calendar board, Pipeline views, a specific
// issue, the Beats workflow — in the default browser. Hands, not brain
// (ADR-0003): it only resolves a fixed URL and hands it to the OS opener.
//
// With a target it opens directly; with no target it shows an interactive
// numbered menu and reads a choice from stdin. The browser launch is an
// injected seam (Opener) so tests assert the resolved URL without opening
// anything. See docs/agents/open.md.
package open

import (
	"bufio"
	"fmt"
	"io"
	"net/url"
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

// Opener launches the default browser for a URL. It is the single seam to the
// outside world; tests substitute a fake that records the URL.
type Opener func(url string) error

// Run resolves the destination from args (or an interactive menu when there are
// none) and opens it, returning a process exit code: 0 on success (the opened
// URL is echoed to stdout), non-zero (with a reason on stderr) otherwise.
//
// Forms: `open <target>`, `open issue <n>`, `open <n>` (bare number → that
// issue), or `open` with no args → the interactive menu.
func Run(args []string, stdin io.Reader, stdout, stderr io.Writer, open Opener) int {
	fail := func(msg string) int {
		fmt.Fprintf(stderr, "contentos open: %s\n", msg)
		return 1
	}
	ts := targets()

	var dest, label string
	switch {
	case len(args) == 0:
		i, cancelled, err := chooseFromMenu(ts, stdin, stdout)
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

	return doOpen(open, dest, label, stdout, stderr)
}

func doOpen(open Opener, dest, label string, stdout, stderr io.Writer) int {
	if err := open(dest); err != nil {
		fmt.Fprintf(stderr, "contentos open: could not open the browser: %v\n", err)
		return 1
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

// chooseFromMenu prints the numbered menu and reads a choice from stdin. A blank
// line cancels (cancelled=true); an out-of-range or non-numeric entry is an error.
func chooseFromMenu(ts []target, stdin io.Reader, stdout io.Writer) (idx int, cancelled bool, err error) {
	fmt.Fprintln(stdout, "Open in the browser:")
	for i, t := range ts {
		fmt.Fprintf(stdout, "  %2d) %-9s %s\n", i+1, t.name, t.desc)
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
	if convErr != nil || n < 1 || n > len(ts) {
		return 0, false, fmt.Errorf("not a valid choice: %q", line)
	}
	return n - 1, false, nil
}

func find(ts []target, name string) *target {
	for i := range ts {
		if ts[i].name == name {
			return &ts[i]
		}
	}
	return nil
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
