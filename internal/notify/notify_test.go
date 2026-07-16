package notify

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// A distinctive token so the token-never-leaks tests can assert its absence.
const (
	testToken  = "123456789:SECRET-TOKEN-MUST-NOT-LEAK"
	testChatID = "42"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

// baseEnv is a fully-configured environment pointing at a fake API server.
func baseEnv(apiBase string) map[string]string {
	return map[string]string{
		"TELEGRAM_BOT_TOKEN": testToken,
		"TELEGRAM_CHAT_ID":   testChatID,
		"TELEGRAM_API_BASE":  apiBase,
	}
}

// recorder records what the fake Telegram server received.
type recorder struct {
	hits int
	path string
	form url.Values
}

// fakeTelegram serves a stand-in Telegram API that records the request and
// replies with the given status and JSON body.
func fakeTelegram(t *testing.T, status int, body string, rec *recorder) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec.hits++
		rec.path = r.URL.Path
		_ = r.ParseForm()
		rec.form = r.PostForm
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// closedServerURL returns the URL of an already-shut-down server, so a request
// to it fails at the transport layer (connection refused).
func closedServerURL(t *testing.T) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	u := srv.URL
	srv.Close()
	return u
}

// errReader fails on read, standing in for a broken stdin.
type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("boom") }

func TestRun_HappyPath_Args(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusOK, `{"ok":true,"result":{}}`, rec)
	var stderr strings.Builder

	code := Run([]string{"hello", "world"}, strings.NewReader(""), &stderr, env(baseEnv(srv.URL)))

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	if rec.hits != 1 {
		t.Fatalf("server hits = %d, want 1", rec.hits)
	}
	if want := "/bot" + testToken + "/sendMessage"; rec.path != want {
		t.Errorf("request path = %q, want %q", rec.path, want)
	}
	if got := rec.form.Get("text"); got != "hello world" {
		t.Errorf("text = %q, want %q (args joined with spaces)", got, "hello world")
	}
	if got := rec.form.Get("chat_id"); got != testChatID {
		t.Errorf("chat_id = %q, want %q", got, testChatID)
	}
	if got := rec.form.Get("disable_web_page_preview"); got != "true" {
		t.Errorf("disable_web_page_preview = %q, want %q", got, "true")
	}
}

func TestRun_HappyPath_Stdin(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusOK, `{"ok":true}`, rec)
	var stderr strings.Builder

	code := Run(nil, strings.NewReader("piped message\n"), &stderr, env(baseEnv(srv.URL)))

	if code != 0 {
		t.Fatalf("exit = %d, want 0; stderr = %q", code, stderr.String())
	}
	if got := rec.form.Get("text"); got != "piped message" {
		t.Errorf("text = %q, want %q (stdin, trailing newline trimmed)", got, "piped message")
	}
}

func TestRun_MissingToken(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusOK, `{"ok":true}`, rec)
	var stderr strings.Builder

	code := Run([]string{"hi"}, strings.NewReader(""), &stderr, env(map[string]string{
		"TELEGRAM_CHAT_ID":  testChatID,
		"TELEGRAM_API_BASE": srv.URL,
	}))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero")
	}
	if !strings.Contains(stderr.String(), "TELEGRAM_BOT_TOKEN") {
		t.Errorf("stderr = %q, want it to name TELEGRAM_BOT_TOKEN", stderr.String())
	}
	if rec.hits != 0 {
		t.Errorf("server hits = %d, want 0 (must not send without a token)", rec.hits)
	}
}

func TestRun_MissingChatID(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusOK, `{"ok":true}`, rec)
	var stderr strings.Builder

	code := Run([]string{"hi"}, strings.NewReader(""), &stderr, env(map[string]string{
		"TELEGRAM_BOT_TOKEN": testToken,
		"TELEGRAM_API_BASE":  srv.URL,
	}))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero")
	}
	if !strings.Contains(stderr.String(), "TELEGRAM_CHAT_ID") {
		t.Errorf("stderr = %q, want it to name TELEGRAM_CHAT_ID", stderr.String())
	}
	if rec.hits != 0 {
		t.Errorf("server hits = %d, want 0", rec.hits)
	}
}

func TestRun_EmptyMessage_Stdin(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusOK, `{"ok":true}`, rec)
	var stderr strings.Builder

	code := Run(nil, strings.NewReader(""), &stderr, env(baseEnv(srv.URL)))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero")
	}
	if !strings.Contains(stderr.String(), "empty message") {
		t.Errorf("stderr = %q, want it to refuse an empty message", stderr.String())
	}
	if rec.hits != 0 {
		t.Errorf("server hits = %d, want 0 (must not send an empty message)", rec.hits)
	}
}

func TestRun_EmptyMessage_Arg(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusOK, `{"ok":true}`, rec)
	var stderr strings.Builder

	// An explicit empty argument must be refused too, not only empty stdin.
	code := Run([]string{""}, strings.NewReader(""), &stderr, env(baseEnv(srv.URL)))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero")
	}
	if !strings.Contains(stderr.String(), "empty message") {
		t.Errorf("stderr = %q, want it to refuse an empty message", stderr.String())
	}
	if rec.hits != 0 {
		t.Errorf("server hits = %d, want 0", rec.hits)
	}
}

func TestRun_StdinReadError(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusOK, `{"ok":true}`, rec)
	var stderr strings.Builder

	code := Run(nil, errReader{}, &stderr, env(baseEnv(srv.URL)))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero on a stdin read error")
	}
	if strings.Contains(stderr.String(), "empty message") {
		t.Errorf("stderr = %q, want a read-error diagnostic, not the empty-message one", stderr.String())
	}
	if rec.hits != 0 {
		t.Errorf("server hits = %d, want 0", rec.hits)
	}
}

func TestRun_HTTPFailure(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusBadRequest, `{"ok":false,"description":"Bad Request: chat not found"}`, rec)
	var stderr strings.Builder

	code := Run([]string{"hi"}, strings.NewReader(""), &stderr, env(baseEnv(srv.URL)))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero")
	}
	s := stderr.String()
	if !strings.Contains(s, "chat not found") {
		t.Errorf("stderr = %q, want Telegram's description surfaced", s)
	}
	if !strings.Contains(s, "not delivered") {
		t.Errorf("stderr = %q, want the not-delivered promise", s)
	}
}

func TestRun_FalseOK(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusOK, `{"ok":false,"description":"reported failure"}`, rec)
	var stderr strings.Builder

	code := Run([]string{"hi"}, strings.NewReader(""), &stderr, env(baseEnv(srv.URL)))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero (a 2xx with ok:false is still a failure)")
	}
	s := stderr.String()
	if !strings.Contains(s, "reported failure") {
		t.Errorf("stderr = %q, want the description surfaced", s)
	}
	if !strings.Contains(s, "not delivered") {
		t.Errorf("stderr = %q, want the not-delivered promise", s)
	}
}

func TestRun_TransportFailure(t *testing.T) {
	var stderr strings.Builder

	code := Run([]string{"hi"}, strings.NewReader(""), &stderr, env(baseEnv(closedServerURL(t))))

	if code == 0 {
		t.Fatalf("exit = 0, want non-zero when the API is unreachable")
	}
	if !strings.Contains(stderr.String(), "not delivered") {
		t.Errorf("stderr = %q, want the not-delivered promise", stderr.String())
	}
}

func TestRun_TokenNeverLeaks_HTTPFailure(t *testing.T) {
	rec := &recorder{}
	srv := fakeTelegram(t, http.StatusBadRequest, `{"ok":false,"description":"Bad Request"}`, rec)
	var stderr strings.Builder

	Run([]string{"hi"}, strings.NewReader(""), &stderr, env(baseEnv(srv.URL)))

	if strings.Contains(stderr.String(), testToken) {
		t.Errorf("HTTP-failure message leaked the token: %q", stderr.String())
	}
}

func TestRun_TokenNeverLeaks_Transport(t *testing.T) {
	// The transport error from the HTTP client embeds the request URL, which
	// contains the token — the message must not carry it through.
	var stderr strings.Builder

	Run([]string{"hi"}, strings.NewReader(""), &stderr, env(baseEnv(closedServerURL(t))))

	if strings.Contains(stderr.String(), testToken) {
		t.Errorf("transport-failure message leaked the token: %q", stderr.String())
	}
}
