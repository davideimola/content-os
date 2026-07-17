# Makefile for the contentos CLI (ADR-0003). The Go toolchain is pinned in
# mise.toml (run `mise install` first). No compiled binaries are committed:
# `build`/`cover` write into bin/, which is gitignored.

GO      ?= go
CMD     := ./cmd/contentos
BINARY  := contentos
BIN_DIR := bin
BIN     := $(BIN_DIR)/$(BINARY)

# Where `install-bin` drops the binary — a normal PATH dir, NOT the mise-managed GOBIN.
# Defaults to ~/.local/bin (no sudo); override, e.g. `make install-bin PREFIX=/usr/local`.
PREFIX  ?= $(HOME)/.local

# Where `install-skills` drops the global skills so they are callable from any repo
# (ADR-0008). Override, e.g. `make install-skills SKILLS_DIR=/path/to/skills`.
SKILLS_DIR ?= $(HOME)/.claude/skills

# The skills that install user-level (personal, global reach). Project-scoped skills
# like `desk` (ADR-0007) stay in-repo and are NOT listed here. Add a name to make a
# skill global; the source of each is .claude/skills/<name>/SKILL.md.
GLOBAL_SKILLS ?= idea

# Arguments for `make run`, e.g. `make run ARGS="notify 'hi'"`.
ARGS ?=

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build the contentos binary into bin/
	$(GO) build -o $(BIN) $(CMD)

.PHONY: install
install: ## Install contentos into GOBIN (go install ./cmd/contentos)
	$(GO) install $(CMD)

.PHONY: install-bin
install-bin: build ## Install contentos into PREFIX/bin (default ~/.local/bin — no sudo; override PREFIX, e.g. PREFIX=/usr/local)
	@install -d "$(PREFIX)/bin"
	install -m 0755 "$(BIN)" "$(PREFIX)/bin/$(BINARY)"
	@echo "installed $(BINARY) -> $(PREFIX)/bin/$(BINARY)"

.PHONY: install-skills
install-skills: ## Install the global skills (GLOBAL_SKILLS) into ~/.claude/skills so they work from any repo (override SKILLS_DIR)
	@for skill in $(GLOBAL_SKILLS); do \
		install -d "$(SKILLS_DIR)/$$skill"; \
		install -m 0644 ".claude/skills/$$skill/SKILL.md" "$(SKILLS_DIR)/$$skill/SKILL.md"; \
		echo "installed $$skill skill -> $(SKILLS_DIR)/$$skill/SKILL.md"; \
	done

.PHONY: setup
setup: install-bin install-skills ## Set up content-os on this machine: build + install the CLI, and install the global skills
	@echo "content-os setup complete — contentos in $(PREFIX)/bin, global skills in $(SKILLS_DIR)"
	@echo "(ensure $(PREFIX)/bin is on PATH; run 'mise install' first if the Go toolchain is missing)"

.PHONY: run
run: ## Run from source; pass ARGS="..." (e.g. make run ARGS="notify hi")
	$(GO) run $(CMD) $(ARGS)

.PHONY: test
test: ## Run the full test suite
	$(GO) test ./...

.PHONY: test-race
test-race: ## Run the test suite with the race detector
	$(GO) test -race ./...

.PHONY: cover
cover: ## Run tests with coverage and write bin/coverage.html
	@mkdir -p $(BIN_DIR)
	$(GO) test -coverprofile=$(BIN_DIR)/coverage.out ./...
	$(GO) tool cover -html=$(BIN_DIR)/coverage.out -o $(BIN_DIR)/coverage.html
	@echo "coverage report: $(BIN_DIR)/coverage.html"

.PHONY: vet
vet: ## Run go vet
	$(GO) vet ./...

.PHONY: fmt
fmt: ## Format the code in place (gofmt -w)
	gofmt -w .

.PHONY: fmt-check
fmt-check: ## Fail if any file is not gofmt-clean
	@unformatted=$$(gofmt -l .); \
	if [ -n "$$unformatted" ]; then \
		echo "not gofmt-clean:"; echo "$$unformatted"; exit 1; \
	fi

.PHONY: tidy
tidy: ## Tidy go.mod and go.sum
	$(GO) mod tidy

.PHONY: check
check: fmt-check vet test ## Run every gate (fmt-check, vet, test) — the pre-commit check

.PHONY: clean
clean: ## Remove build artifacts (bin/)
	rm -rf $(BIN_DIR)
