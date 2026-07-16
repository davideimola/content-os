# Makefile for the contentos CLI (ADR-0003). The Go toolchain is pinned in
# mise.toml (run `mise install` first). No compiled binaries are committed:
# `build`/`cover` write into bin/, which is gitignored.

GO      ?= go
CMD     := ./cmd/contentos
BINARY  := contentos
BIN_DIR := bin
BIN     := $(BIN_DIR)/$(BINARY)

# Arguments for `make run`, e.g. `make run ARGS="idea create 'a spark'"`.
ARGS ?=

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build the contentos binary into bin/
	$(GO) build -o $(BIN) $(CMD)

.PHONY: install
install: ## Install contentos into GOBIN (go install ./cmd/contentos)
	$(GO) install $(CMD)

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
