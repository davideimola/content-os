# Zero-Marginal-Cost Agentic LLM on a GitHub Actions Cron (2026)

> Research date: 2026-07-17. Every factual/quantitative claim cites a primary source — the vendor's own
> docs, pricing page, first-party API reference, or the tool's own repo (URLs inline per claim). Where a
> number is not published in a primary source, it is flagged as such rather than invented. Secondary
> reporting is used only where a vendor made a change *without* a primary announcement (noted inline).
>
> **Scope:** the recurring task is *agentic* — each of ~9 low-frequency runs/month (2 weekly Beats + 1
> monthly) must check out the repo, read Markdown instruction docs, run arbitrary bash (`gh` issues +
> `gh project`), make editorial judgments, and send one Telegram
> message, unattended on an `ubuntu` runner. So it needs an **agentic harness** (file read + bash/tool
> use + multi-step loop), not a single chat completion, and a model with a **large enough context to hold
> 50k–300k tokens per run**. This doc lives alongside `linkedin-personal-analytics-api.md` under the
> repo's existing `docs/research/` convention.

## TL;DR verdict

1. **Best zero-cost path: Google Gemini API free tier (free Google AI Studio key) driven by the official
   `run-gemini-cli` GitHub Action (Gemini CLI).** It is the only genuinely-free option that clears every
   hard requirement at once: a perpetual free key (no card), a **1M-token context** that swallows a
   50k–300k-token run in one shot, a real headless bash+file agent loop, an official cron-capable Action,
   and documented `gh`-CLI tool-calling. Free-tier quota (~1,000 requests/day) dwarfs 9 runs/month.
   <https://github.com/google-github-actions/run-gemini-cli>
2. **The catch is model quality, not plumbing.** The free *API-key* tier is effectively **Flash-class**
   (Gemini 2.5/3 Flash). Flash is weaker than Gemini Pro/Claude at nuanced editorial judgment — the exact
   thing these Beats need. Mitigations below (keep Davide as final judge via the existing Telegram ping;
   check whether Pro is usable on the free tier in the live AI Studio dashboard; keep the harness
   model-agnostic so a stronger model can be swapped in later).
3. **GitHub Models is the tempting-but-wrong answer.** It needs zero extra secrets (built-in `GITHUB_TOKEN`
   + `models: read`) and is OpenAI-shaped — but the free tier caps **input at 8,000 tokens/request** and
   high-end models at **50 requests/day**. That cannot hold a 50k–300k-token agentic context. Disqualified
   for this task's shape. <https://docs.github.com/github-models/prototyping-with-ai-models>
4. **Perplexity Pro no longer helps here — twice over.** The bundled **$5/month API credit was discontinued
   (~12 Feb 2026)**; the API is now pure pay-as-you-go ("No subscription required"), so it is *not*
   zero-marginal. And the Sonar/Agent API only exposes **Perplexity's own built-in tools** (web search,
   finance, fetch-url) — **no user-defined function calling**, so it cannot back a general agentic harness.
   <https://docs.perplexity.ai/getting-started/pricing> · <https://docs.perplexity.ai/docs/agent-api/quickstart>
5. **Genuine free fallbacks exist but are secondary:** **Groq** (best privacy + tool use, but tight
   throughput caps), **OpenRouter** `:free` models (ample request budget for 9 runs, but may train on your
   data and are "not suitable for production"). **Cerebras** is now a 30-day $5 trial (not perpetual);
   **Mistral**'s free tier trains on your data by default. All are OpenAI-compatible, so any model-agnostic
   harness (**opencode**, **Crush**, **Cline CLI**) can point at them.
6. **The two avoided Claude paths:** a new **Anthropic API key** = a new paid account; the **Claude
   Pro/Max subscription OAuth token in Actions** is now **restricted by Anthropic's ToS (Feb 2026)** to
   Claude Code / claude.ai only — a gray area, best avoided. <https://code.claude.com/docs/en/legal-and-compliance>

---

## 1. Google Gemini API free tier + Gemini CLI  ·  **recommended base**

**Free-tier limits.** Google no longer publishes the exact per-model free RPM/TPM/RPD in a static table —
the rate-limits page now states limits "can be viewed in Google AI Studio" and points to the live
dashboard <https://ai.google.dev/gemini-api/docs/rate-limits> (dashboard: <https://aistudio.google.com/rate-limit>).
The concrete primary numbers that *are* published:

- Google's own `gemini-cli` README: a free **Gemini API key** gives **"1000 requests/day with Gemini 3"**;
  a free **Google-account login (OAuth)** gives **"60 requests/min and 1,000 requests/day."**
  <https://github.com/google-gemini/gemini-cli>
- The pricing page (dated 2026-07-09) lists **Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash-Lite, 3.5 Flash, and
  3.1 Flash-Lite** as **"Free of charge"** input/output on the Standard (free) tier; the Flash free tier
  also includes **free Google Search grounding up to 500 RPD**, while for 3.5 Flash "Free tier users cannot
  access grounding tools." <https://ai.google.dev/gemini-api/docs/pricing>
- Flash/Pro models carry a **1M-token context window** — this is the property that makes a 50k–300k-token
  run feasible in a single request, unlike GitHub Models. <https://github.com/google-gemini/gemini-cli>

For 9 runs/month, a 1,000-req/day budget is effectively unlimited (even a multi-step agent loop making
dozens of model calls per run stays well inside a daily cap).

**Agentic-harness fit.** Gemini CLI is a full headless agent: built-in **Shell Commands** and **File System**
tools and a real act/observe loop <https://github.com/google-gemini/gemini-cli>. Headless mode triggers with
`-p`/`--prompt` (or any non-TTY), emits `--output-format json|stream-json` (events `init`/`message`/
`tool_use`/`tool_result`/`result`), and auto-approves tools with **`--approval-mode yolo`** (the older
`--yolo` is deprecated). <https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md> ·
<https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md> Model via `-m`, key via
`GEMINI_API_KEY`. **Caveat: Gemini CLI is Gemini-only** — it documents no OpenAI-compatible base URL or
non-Gemini providers <https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/model.md>. That is fine
*if* you commit to Gemini; if you want to swap models later, use a model-agnostic harness (§5).

**GitHub Actions setup shape.** The official Google action wires it up in one step and supports cron:
`uses: google-github-actions/run-gemini-cli@<version>` with `gemini_api_key: ${{ secrets.GEMINI_API_KEY }}`
("Obtain your API key from Google AI Studio with generous free-of-charge quotas") and a `prompt` input; it
explicitly can "interact with other CLIs like the GitHub CLI (`gh`)."
<https://github.com/google-github-actions/run-gemini-cli>

**Data / privacy — important.** On the **free (Unpaid) tier**, Google's Gemini API Additional Terms say:
*"Google uses the content you submit to the Services and any generated responses to provide, improve, and
develop Google products and services"*, that **human reviewers may read/annotate/process** API input and
output, and *"Do not submit sensitive, confidential, or personal information to the Unpaid Services."* The
**paid** tier is the opposite: *"Google doesn't use your prompts … or responses to improve our products."*
<https://ai.google.dev/gemini-api/terms> For this pipeline (editorial ideas, GitHub issues) that is
probably acceptable, but it means the free tier trains on your prompts — keep genuinely sensitive material
out of the Beat context.

**Reliability caveats.** Free-tier quota is "not guaranteed" and varies by region/account/billing status
(shown live in the AI Studio dashboard) <https://ai.google.dev/gemini-api/docs/rate-limits>; there is no
free-tier SLA.

## 2. GitHub Models inside Actions  ·  **disqualified by context size**

**Free-tier limits (Copilot Free/Pro).** Per the docs' rate-limit table: **Low models** 15 rpm / 150 rpd,
**High models** 10 rpm / **50 rpd**, both **8,000 input / 4,000 output tokens per request**, embeddings
64,000 tokens/request. <https://docs.github.com/github-models/prototyping-with-ai-models> The **8k-input
cap is the dealbreaker**: a 50k–300k-token agentic context cannot fit in one request, and an agent loop
would blow the 8k ceiling within a couple of turns; the 50-rpd high-model cap compounds it.

**Agentic-harness fit / setup.** Mechanically ideal otherwise: an OpenAI-shaped chat-completions endpoint
at **`https://models.github.ai/inference/chat/completions`**, model id in `{publisher}/{model}` form (e.g.
`openai/gpt-4.1`), authenticated by the built-in `GITHUB_TOKEN` when the workflow declares
`permissions: models: read` — **no extra secret**. <https://docs.github.com/en/rest/models/inference> ·
quickstart <https://docs.github.com/en/github-models/quickstart> · official `actions/ai-inference@v1`
<https://github.com/actions/ai-inference> Any OpenAI-compatible harness can target it.

**Data / privacy.** GitHub defers to the model host: *"Your use of this feature is subject to the terms of
the company hosting the model and the model license."*
<https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features>

**Verdict.** Perfect for tiny, single-shot inferences (issue-comment summaries), wrong for a large-context
multi-step agent. Only viable here if the Beat were decomposed into many ≤8k-token sub-prompts — which
fights the agentic design and the 50-rpd cap.

## 3. Perplexity (user has Perplexity Pro)  ·  **disqualified twice**

**No zero-marginal path anymore.** The Pro plan's **$5/month API credit was discontinued around 12 Feb
2026** (Perplexity removed it without a primary announcement; corroborated by multiple reports citing
Perplexity support, and the help center now shows Pro carries no monthly credit —
<https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work-on-perplexity>, which returns
403 to automated fetches so this specific detail rests on that reporting). The API pricing page is now
explicit that it is **pay-as-you-go, "No subscription required"** — i.e. Pro grants no API allowance, so
using it would mean topping up a paid balance (a new paid arrangement). <https://docs.perplexity.ai/getting-started/pricing>

**Not usable as a general agentic backend.** The **Sonar API is in "maintenance mode"** and offers only
built-in web search, no custom tools <https://docs.perplexity.ai/docs/sonar/quickstart>. The successor
**Agent API** exposes only **Perplexity's own built-in tools** (`web_search`, `finance_search`, fetch-url)
and has **no user-defined function calling** <https://docs.perplexity.ai/docs/agent-api/quickstart>. It
cannot drive `gh`, `go`, or arbitrary bash — so it cannot be the harness's model even if it were free.

**Bottom line.** Perplexity Pro is great for interactive research (and useful in this very repo's
"AI-app capture door" via its GitHub connector), but it is the wrong tool for an autonomous CI agent, and
its API is no longer free.

## 4. Other genuinely-free providers (as swap-in model endpoints)

All four below are OpenAI-compatible, so any model-agnostic harness (§5) can point at them. Ranked by fit.

**Groq — best privacy + solid tool use; throughput-capped.**
- Free-tier limits are published per model (RPM/RPD/TPM/TPD), e.g. `llama-3.3-70b-versatile` 30 rpm / 1K rpd
  / **12K TPM / 100K TPD**; `openai/gpt-oss-120b` 30 rpm / 1K rpd / **8K TPM / 200K TPD**; limits are
  org-wide and return 429 + `retry-after`. <https://console.groq.com/docs/rate-limits>
- Tool use / function calling: **yes**, across the gpt-oss / llama / qwen3 / llama-4-scout models
  <https://console.groq.com/docs/tool-use>. OpenAI-compatible base URL `https://api.groq.com/openai/v1`
  <https://console.groq.com/docs/openai>.
- Privacy is the standout: *"Groq is not permitted to use Inputs or Outputs for training or fine-tuning …
  unless explicitly granted permission"* <https://console.groq.com/docs/legal/services-agreement>, default
  no-retention + optional ZDR <https://console.groq.com/docs/your-data>.
- **Reliability caveat:** the **TPM/TPD ceilings** are the problem for this task — an 8K–12K TPM cap forces
  a 50k+-token run to be paced/chunked over minutes, and a 100K–200K TPD cap means a single 300k-token run
  may not complete in one day on the strong models. Fine as a *failover* model, awkward as the primary for
  large-context runs.

**OpenRouter `:free` models — ample request budget, weak privacy/reliability.**
- **20 rpm**, and **50 req/day** if you've never bought credits (or **1,000 req/day** once you've purchased
  ≥ $10 in credits) <https://openrouter.ai/docs/api-reference/limits> · <https://openrouter.ai/docs/faq>.
  These are request-count caps, not token caps — 9 runs/month sits comfortably under even the 50/day floor.
- Many tool-capable free models (e.g. `gpt-oss-20b`, Gemma 4, Nemotron 3) <https://openrouter.ai/collections/free-models>;
  OpenAI-compatible base URL `https://openrouter.ai/api/v1` <https://openrouter.ai/docs/quickstart>.
- **Privacy caveat:** free variants may be used for training by the upstream provider unless you opt out in
  account settings (e.g. *"If you are using Laguna M.1 for free, we may use your inputs and outputs to train
  and improve our models"*); opting out restricts which free routes are available. ZDR available.
  <https://openrouter.ai/docs/features/privacy-and-logging> · <https://openrouter.ai/docs/guides/features/zdr>
- **Reliability caveat:** OpenRouter itself calls free models "usually not suitable for production use."
  <https://openrouter.ai/docs/faq>

**Cerebras — no longer a perpetual free tier.** Current primary docs show a **$5 credit trial that expires
30 days after grant and requires a verified payment method** — not an ongoing free tier — plus tight trial
caps (e.g. `gpt-oss-120b` 5 rpm / 30K TPM / 1M TPD). <https://inference-docs.cerebras.ai/support/rate-limits>
Tool use supported (model-dependent) and OpenAI-compatible (`https://api.cerebras.ai/v1`)
<https://inference-docs.cerebras.ai/resources/openai>; strong privacy (no retention per privacy policy
<https://www.cerebras.ai/privacy-policy>). Poor fit for a recurring monthly cron because the trial expires.

**Mistral (la Plateforme free "Experiment" tier) — trains on your data by default.** Function calling is
supported <https://docs.mistral.ai/capabilities/function_calling/> and the endpoint is OpenAI-shaped
(`https://api.mistral.ai/v1/chat/completions`) <https://docs.mistral.ai/api>, but (a) the **exact free
limits are not published** — the tier page pushes you to the per-org Admin Console
<https://docs.mistral.ai/admin/user-management-finops/tier>, and (b) the terms carve out the free tier from
the no-training default: *"We do not use Your Data to train our … models except (a) when you (i) use Mistral
AI Products under a free subscription … and (ii) you have not opted-out of training …"*
<https://legal.mistral.ai/terms/eu-consumers-terms-of-service>. Weakest free-tier privacy posture here.

## 5. Agentic harnesses (model-agnostic, headless in CI)

All facts from each tool's own repo/docs. The requirement matrix: (a) read files, (b) run arbitrary bash
(`gh`, `go`), (c) multi-step agent loop, (d) fully non-interactive with auto-approved tools, (e) point at an
arbitrary/free model endpoint.

| Harness | Headless invocation | Auto-approve tools | Bash + file loop | Arbitrary/OpenAI-compat model | Fit |
|---|---|---|---|---|---|
| **Gemini CLI** | `-p` / non-TTY | `--approval-mode yolo` | yes | **Gemini only** | full loop, not model-agnostic |
| **opencode** | `opencode run "…"` | `--auto` | yes (`bash`,`edit`) | yes, `@ai-sdk/openai-compatible` provider | **full fit** |
| **Crush** (Charm) | `crush run …` | `--yolo` | yes | yes, `openai`/`openai-compat` providers | **full fit** (single Go binary) |
| **Cline CLI 2.0** | `cline "…"` | `-y`/`--yolo`, `--json` | yes | yes, "any OpenAI-compatible endpoint" | **full fit** |
| **Goose** (Block) | `goose run -t "…"` | `GOOSE_MODE=auto` | yes (`developer` ext) | yes, `OPENAI_HOST` custom base URL | full fit (tool-heavy; "works best with Claude 4") |
| **OpenHands** | `openhands --headless -t "…"` | always-approve (automatic) | yes | yes, LiteLLM `LLM_BASE_URL` | fits, but needs Docker/sandbox (heavy) |
| **aider** | `--message` + `--yes-always` | n/a (bounded) | test/lint reflect-fix only | yes, `--openai-api-base` | partial — edit/commit assistant, not free-form tool use |
| shell-gpt | `--no-interaction` | no auto-exec | no real loop | yes | not an agent loop — skip |

Primary sources: Gemini CLI headless <https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md>;
opencode <https://opencode.ai/docs/cli>, <https://opencode.ai/docs/permissions>, <https://opencode.ai/docs/providers>;
Crush <https://github.com/charmbracelet/crush>, <https://charmbracelet-crush.mintlify.app/cli/run>;
Cline <https://github.com/cline/cline/blob/main/apps/cli/README.md>, <https://docs.cline.bot/usage/cli-overview>;
Goose <https://goose-docs.ai/docs/guides/goose-cli-commands/>, <https://goose-docs.ai/docs/getting-started/providers/>;
OpenHands <https://docs.openhands.dev/usage/how-to/headless-mode>, <https://docs.openhands.dev/usage/llms/llms>;
aider <https://aider.chat/docs/scripting.html>, <https://aider.chat/docs/config/options.html>.

**Reading:** if you commit to Gemini, **Gemini CLI / `run-gemini-cli`** is the least-effort choice
(one official Action, Gemini-only doesn't matter). If you want to keep the model swappable across the §4
free providers, **opencode** or **Crush** (a single static Go binary — pleasant in CI) are the cleanest
model-agnostic headless agents; **Cline CLI 2.0** is equally capable and explicitly lists Groq/Cerebras/
OpenRouter. One caveat carried from primary docs: these loops are tool-calling-heavy, so a very weak
free model degrades them (Goose's docs say it "works best with Claude 4") — a capability risk, not a
compatibility one.

## 6. Contrast — the two Claude paths being avoided (one line each)

- **New Anthropic API key:** the official Claude Code Action requires `ANTHROPIC_API_KEY` from
  console.anthropic.com (or Bedrock/Vertex) — i.e. a **new paid API account**, which the constraints rule
  out. <https://code.claude.com/docs/en/github-actions>
- **Claude Pro/Max subscription OAuth token in Actions:** now **contractually restricted** — *"OAuth
  authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise
  subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic
  applications"*, while developers/tools "should use API key authentication … Anthropic does not permit
  third-party developers to … route requests through Free, Pro, or Max plan credentials" (Feb 2026). Using
  a subscription OAuth token to drive a CI agent is a gray area, best avoided.
  <https://code.claude.com/docs/en/legal-and-compliance>

---

## RECOMMENDATION

**Run the Beats on the Google Gemini API free tier, driven by a headless agentic harness, on a scheduled
Actions workflow.** Concretely:

- **Model:** free Google AI Studio API key (`GEMINI_API_KEY`, no card). Start on **Gemini Flash** (2.5/3
  Flash) — 1M-token context, ~1,000 req/day free, easily covers 9 runs/month and a 50k–300k-token context
  per run. <https://github.com/google-gemini/gemini-cli> · <https://ai.google.dev/gemini-api/docs/pricing>
- **Harness — pick one of two:**
  1. *Simplest:* the **official `run-gemini-cli` Action** (Gemini CLI). One step, cron-native, documented
     `gh` tool-calling, auto-approve via `--approval-mode yolo`. Gemini-only is a non-issue here.
     <https://github.com/google-github-actions/run-gemini-cli>
  2. *Model-portable:* **opencode** or **Crush** in `run --auto`/`--yolo` mode pointed at an
     OpenAI-compatible endpoint, so you can swap Gemini → Groq/OpenRouter (or a cheap paid model) later
     without touching the Beat. <https://opencode.ai/docs/providers> · <https://github.com/charmbracelet/crush>
- **Actions wiring (sketch):**
  ```yaml
  on:
    schedule:
      - cron: "0 7 * * 1"   # weekly Beat (Mon 07:00 UTC)
      - cron: "0 7 1 * *"   # monthly Beat (1st, 07:00 UTC)
  permissions:
    contents: read
    issues: write            # gh issues read/write
  jobs:
    beat:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: google-github-actions/run-gemini-cli@v0
          with:
            gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
            prompt: "Follow docs/agents/… run the <weekly|monthly> Beat."
          env:
            GH_TOKEN:            ${{ secrets.GH_PROJECT_PAT }}   # see caveat
            TELEGRAM_BOT_TOKEN:  ${{ secrets.TELEGRAM_BOT_TOKEN }}
            TELEGRAM_CHAT_ID:    ${{ secrets.TELEGRAM_CHAT_ID }}
  ```
  Secrets to add: `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and a `gh`-capable token.
  **Setup caveat to verify:** the built-in `GITHUB_TOKEN` covers issues but **does not grant Projects v2
  access**, so `gh project` needs a fine-grained/classic **PAT with `project` scope** — confirm this against
  current GitHub docs when wiring it, as it is a `gh`/Projects constraint rather than an LLM one.

### Editorial-judgment quality risk (flagged, as requested)

The Beats need real editorial judgment (what to slot, kill, recycle), and the **free API-key tier is
Flash-class**. Flash is materially weaker than Gemini Pro or Claude at nuanced, taste-driven calls — the
single biggest risk in this plan. It is a *quality* risk, not a plumbing one. Manage it by:

1. **Keep Davide as the final judge.** Every Beat already ends by pinging Telegram (the notify seam),
   and the repo's philosophy is explicitly "capture first, judge later." Have the agent *propose* editorial
   moves and let the human ratify — a Flash-class model is adequate as a well-instructed *drafter/triager*,
   riskier as an autonomous *decider*.
2. **Check whether Gemini Pro is usable on the free tier for these runs.** The pricing page (2026-07-09)
   still lists **Gemini 2.5 Pro as "free of charge"** on the Standard tier
   <https://ai.google.dev/gemini-api/docs/pricing>, though secondary reports claim Pro was pulled from the
   free API tier in April 2026 and the *exact* free-tier Pro RPM/RPD is only visible in the live AI Studio
   dashboard <https://ai.google.dev/gemini-api/docs/rate-limits>. Because this is only ~9 low-frequency
   runs/month, even a low daily Pro cap *might* suffice — **verify the live Pro quota in the dashboard
   before relying on it**, remembering that one agentic run makes many model calls, so a per-day request cap
   can bite inside a single run.
3. **Keep the harness model-agnostic (option 2 above)** so a stronger model — a better free model, or a
   cheap metered paid one if judgment quality proves insufficient — can be swapped in without rewriting the
   Beat. This preserves the "zero cost now, escape hatch later" posture.

Also weigh the **free-tier data-usage term**: Google trains on free-tier prompts/outputs and may human-review
them <https://ai.google.dev/gemini-api/terms>. For editorial ideas and public GitHub issues that is likely
fine; keep anything genuinely sensitive out of the Beat context, or move to Groq (contractual no-training)
as the model backend if that term is unacceptable.

---

## Open questions / not verified in a primary source

1. **Exact free-tier Gemini RPM/TPM/RPD per model** — Google moved these off the static docs into the live
   AI Studio dashboard <https://ai.google.dev/gemini-api/docs/rate-limits>; the only published figures are
   the `gemini-cli` README's "~1,000 requests/day" and the pricing page's "free of charge" + "500 RPD free
   Google Search."
2. **Whether Gemini 2.5/3 Pro is genuinely usable on the free API tier in 2026** — primary pricing page says
   "free of charge" (2026-07-09) but secondary sources report an April-2026 removal; unresolved from
   primary sources, check the dashboard.
3. **Perplexity Pro $5-credit removal** rests on reporting citing Perplexity support (the help-center page
   returns 403 to automated fetches); the *pay-as-you-go / no-subscription* pricing model is, however,
   directly confirmed <https://docs.perplexity.ai/getting-started/pricing>.
4. **Mistral free-tier numeric limits** are not published (Admin-Console-only) <https://docs.mistral.ai/admin/user-management-finops/tier>.
5. **Cerebras free-trial exact model IDs** (`zai-glm-4.7`, `gemma-4-31b`) came via text extraction and the
   Inference Terms PDF was unreadable; treat those IDs and the terms' training clause as needing an
   eyes-on console check (the privacy policy's no-retention statement is verified).
6. **`gh project` (Projects v2) token scope in Actions** — the PAT-with-`project`-scope requirement is a
   well-known GitHub behavior but was not re-verified against a primary URL for this doc; confirm at wiring
   time.
