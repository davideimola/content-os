# open seam: browser shortcuts to Content OS

`contentos open` opens a Content OS destination — the [Calendar](../../CONTEXT.md) board, a
[Pipeline](../../CONTEXT.md) view, a specific issue, the [Beats](../../CONTEXT.md) workflow — in the
default browser. It is a convenience surface, **hands, not brain** (ADR-0003): it only resolves a
fixed URL and hands it to the OS opener; it holds no state and touches no GitHub API.

## Usage

```sh
contentos open board          # the Calendar board (GitHub Projects)
contentos open pipeline       # all open Pipeline issues
contentos open ideas          # the Idea inbox (label:idea)
contentos open proposed       # proposed pieces
contentos open slotted        # slotted pieces
contentos open talks          # talks & CFP (label:talk)
contentos open blog           # blog pieces
contentos open beats          # the Beats workflow runs (Actions)
contentos open repo           # the content-os repo

contentos open issue 42       # a specific issue
contentos open 42             # bare number — same thing

contentos open                # no target → interactive picker (fzf if installed, else a menu)
```

- **Named targets** resolve to a GitHub URL (the board, or an `is:issue is:open label:<x>` search on
  `davideimola/content-os`). The set is fixed in the binary — the Pipeline's home never varies (ADR-0001).
- **`issue <n>`** (or a bare `<n>`) opens `github.com/davideimola/content-os/issues/<n>`.
- **No target** picks interactively: an `fzf` fuzzy finder when it is on `PATH`, otherwise a numbered
  stdin menu (a blank line cancels).
- On success the opened URL is echoed to stdout. **Exit status is the contract:** `0` opened,
  non-zero (with a reason on stderr) for an unknown target, a bad issue number, or a browser-launch
  failure.

## Seams: opener, picker, completion

Two injected seams keep it testable:

- **`open.Opener`** — the browser launch. Production picks the platform opener — `open` (macOS),
  `xdg-open` (Linux), `rundll32` (Windows). Tests substitute a fake that records the resolved URL, so
  they assert every destination **without launching a browser**.
- **`open.Picker`** — the no-target interactive pick. Production (`SystemPicker`) uses **`fzf`** when
  it is on `PATH` (a real fuzzy finder over the destinations) and falls back to a numbered stdin menu
  (`NumberedMenu`); tests drive the menu directly, so they never spawn an fzf UI.

Separately, **Cobra dynamic completion** suggests the targets: install it once with
`contentos completion <shell>` (e.g. `contentos completion zsh`), then `contentos open <TAB>` filters
the targets — fuzzily if you use **fzf-tab**. This is the idiomatic Cobra mechanism; Cobra ships no
picker of its own.

## Building the CLI

Same as the rest of `contentos` (see [notify.md](notify.md#building-the-cli)). Because `open` is a
handy day-to-day shortcut, install it where your `PATH` will find it: `make install-bin` drops the
binary in `/usr/local/bin` (override `PREFIX`), sidestepping the mise-managed `GOBIN`.

## Testing

`go test ./internal/open/` (or the whole suite, `go test ./...`). The tests drive `contentos open`
against a recording opener and assert the resolved URL for every named target, `issue <n>` and the
bare-number shortcut, the interactive menu (choice, cancel, out-of-range), the rejections (unknown
target, bad issue number), and that a browser-launch failure surfaces as a non-zero exit. No network,
no browser.
