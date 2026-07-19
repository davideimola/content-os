# Makefile for content-os. The Go CLI (`contentos`) was retired (ADR-0015): its
# jobs moved to the content-os MCP adapter (metrics ingest) and the front end /
# a bookmark (open); `notify` had already left for the Beats' bash (ADR-0009).
# What remains here is installing the user-level Claude skills.

# Where `install-skills` drops the global skills so they are callable from any
# repo (ADR-0008). Override, e.g. `make install-skills SKILLS_DIR=/path`.
SKILLS_DIR ?= $(HOME)/.claude/skills

# The skills that install user-level (personal, global reach): `idea` (capture
# from any repo) and `review` (the Monthly reminder points at it). `desk`
# (ADR-0007) stays in-repo and is NOT listed. Source: .claude/skills/<name>/SKILL.md.
GLOBAL_SKILLS ?= idea review

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.PHONY: install-skills
install-skills: ## Install the global skills (GLOBAL_SKILLS) into ~/.claude/skills so they work from any repo (override SKILLS_DIR)
	@for skill in $(GLOBAL_SKILLS); do \
		install -d "$(SKILLS_DIR)/$$skill"; \
		install -m 0644 ".claude/skills/$$skill/SKILL.md" "$(SKILLS_DIR)/$$skill/SKILL.md"; \
		echo "installed $$skill skill -> $(SKILLS_DIR)/$$skill/SKILL.md"; \
	done

.PHONY: setup
setup: install-skills ## Set up content-os on this machine (install the global skills)
	@echo "content-os setup complete — global skills in $(SKILLS_DIR)"
