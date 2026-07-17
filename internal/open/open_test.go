package open

import (
	"errors"
	"strings"
	"testing"
)

// run drives Run with a recording opener and captured IO — no browser is launched.
func run(args []string, stdin string) (code int, opened, stdout, stderr string) {
	var out, errb strings.Builder
	rec := func(u string) error { opened = u; return nil }
	code = Run(args, strings.NewReader(stdin), &out, &errb, rec, NumberedMenu)
	return code, opened, out.String(), errb.String()
}

func TestOpen_NamedTargets(t *testing.T) {
	cases := []struct{ target, want string }{
		{"board", "/users/davideimola/projects/2"},
		{"pipeline", "/issues?q="},
		{"ideas", "label%3Aidea"},
		{"proposed", "label%3Aproposed"},
		{"slotted", "label%3Aslotted"},
		{"talks", "label%3Atalk"},
		{"blog", "label%3Ablog"},
		{"beats", "/actions/workflows/beats.yml"},
		{"repo", "https://github.com/davideimola/content-os"},
	}
	for _, c := range cases {
		code, opened, _, stderr := run([]string{c.target}, "")
		if code != 0 {
			t.Fatalf("%s: exit=%d stderr=%q", c.target, code, stderr)
		}
		if !strings.Contains(opened, c.want) {
			t.Errorf("%s: opened %q, want to contain %q", c.target, opened, c.want)
		}
	}
}

func TestOpen_Issue(t *testing.T) {
	for _, args := range [][]string{{"issue", "42"}, {"42"}} {
		code, opened, _, stderr := run(args, "")
		if code != 0 {
			t.Fatalf("%v: exit=%d stderr=%q", args, code, stderr)
		}
		if !strings.HasSuffix(opened, "/issues/42") {
			t.Errorf("%v: opened %q, want to end with /issues/42", args, opened)
		}
	}
}

func TestOpen_Rejections(t *testing.T) {
	cases := []struct {
		name string
		args []string
	}{
		{"unknown target", []string{"nope"}},
		{"issue without number", []string{"issue"}},
		{"issue with non-number", []string{"issue", "abc"}},
		{"issue zero", []string{"issue", "0"}},
	}
	for _, c := range cases {
		code, opened, _, stderr := run(c.args, "")
		if code == 0 {
			t.Errorf("%s: exit=0, want non-zero", c.name)
		}
		if opened != "" {
			t.Errorf("%s: opened %q, want no browser launch", c.name, opened)
		}
		if strings.TrimSpace(stderr) == "" {
			t.Errorf("%s: empty stderr, want a diagnostic", c.name)
		}
	}
}

func TestOpen_InteractiveMenuChoice(t *testing.T) {
	code, opened, stdout, stderr := run(nil, "1\n") // pick item 1 (board)
	if code != 0 {
		t.Fatalf("exit=%d stderr=%q", code, stderr)
	}
	if !strings.Contains(opened, "/projects/2") {
		t.Errorf("opened %q, want the board (menu item 1)", opened)
	}
	if !strings.Contains(stdout, "board") {
		t.Errorf("stdout %q, want the menu listing", stdout)
	}
}

func TestOpen_MenuCancel(t *testing.T) {
	code, opened, _, _ := run(nil, "\n") // a blank line cancels
	if code != 0 {
		t.Errorf("exit=%d, want 0 on cancel", code)
	}
	if opened != "" {
		t.Errorf("opened %q, want nothing on cancel", opened)
	}
}

func TestOpen_MenuInvalidChoice(t *testing.T) {
	code, opened, _, stderr := run(nil, "99\n")
	if code == 0 {
		t.Errorf("exit=0, want non-zero on out-of-range choice")
	}
	if opened != "" {
		t.Errorf("opened %q, want nothing", opened)
	}
	if strings.TrimSpace(stderr) == "" {
		t.Errorf("empty stderr, want a diagnostic")
	}
}

func TestOpen_OpenerErrorSurfaces(t *testing.T) {
	var out, errb strings.Builder
	code := Run([]string{"board"}, strings.NewReader(""), &out, &errb,
		func(string) error { return errors.New("boom") }, NumberedMenu)
	if code == 0 {
		t.Errorf("exit=0, want non-zero when the opener fails")
	}
	if !strings.Contains(errb.String(), "could not open the browser") {
		t.Errorf("stderr=%q, want the open-failure diagnostic", errb.String())
	}
}
