package main

import (
	"strings"
	"testing"
)

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
