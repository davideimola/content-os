# Pipeline taxonomy: labels

The [Pipeline](../../CONTEXT.md) is the single home for every idea, proposal, and in-flight piece across all channels, tracked as GitHub issues on `davideimola/content-os`. Its shared vocabulary is made real on the tracker as labels, so every skill and Beat classifies the same way. Two axes: a **state** (where a piece is in its life) and one or more **dimensions** (what it is).

Terms below are defined in the glossary (`CONTEXT.md`) — use them, don't drift to synonyms.

## State labels — mutually exclusive

A piece carries **exactly one** state at a time. The states advance in order; a Beat or skill that moves a piece forward removes the old state and adds the new one. Mutual exclusivity is a convention the skills and Beats enforce — GitHub does not.

| Label | Meaning |
| --- | --- |
| `idea` | A raw, unjudged spark captured in under 30s. Capture first, judge later. |
| `proposed` | Judged into a concrete proposal during a Beat: thesis, format, channel decided. |
| `slotted` | Placed on the Calendar (Projects board) with a target date. |
| `in-production` | Being produced in a Factory — a draft, PR, or slides in progress. |
| `published` | Shipped on its channel. Terminal state. |

Flow: `idea` → `proposed` → `slotted` → `in-production` → `published`.

## Dimension labels — combinable

Dimensions describe the piece and steer the mix. A judged piece (`proposed` onward) should carry a **Flag/Side** label and a **channel**; an `idea` may carry none until it's judged.

**Flag vs Side** — exactly one once judged (they are mutually exclusive by convention):

| Label | Meaning |
| --- | --- |
| `flag` | Flag content: directly reinforces the Positioning. Steering target ~70% of output. |
| `side` | Side content: legitimate off-flag content for variety and authenticity. |

**Channel** — where the piece publishes. A single piece usually has one; derived content (e.g. a talk that spawns a LinkedIn post) is tracked as separate linked issues, each with its own channel.

| Label | Meaning |
| --- | --- |
| `blog` | The blog on davideimola.dev — the canonical home. |
| `linkedin` | LinkedIn — the amplifier; value delivered natively in-feed. |
| `talk` | A conference talk treated as editorial work. |

**CFP tracking**:

| Label | Meaning |
| --- | --- |
| `cfp` | A CFP opportunity tracked with its deadline and outcome. Pairs with `talk`. |

## How issues acquire labels

- **Idea template** (`.github/ISSUE_TEMPLATE/idea.yml`) applies `idea` on creation. Nothing else — no format, channel, or quality decision at capture time.
- **CFP template** (`.github/ISSUE_TEMPLATE/cfp.yml`) applies `cfp` and `talk` on creation.
- **Capture doors** file Ideas directly with the `idea` label and nothing else. The terminal door is `contentos idea create` (see [idea.md](idea.md)); the AI-app door files the same shape from any app with a write-capable GitHub connector (see [app-capture.md](app-capture.md)). Blank issues stay enabled so capture is never forced through a form.
- **Beats** advance state and set dimensions: the Monday planning Beat turns `idea` into `proposed` with a Flag/Side and channel; slotting adds `slotted`; a Factory picking it up moves it to `in-production`; the creator publishing moves it to `published`.

## Triage vs Pipeline labels

The triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` — see [`triage-labels.md`](triage-labels.md)) govern engineering issues on this repo. They are orthogonal to the Pipeline states above, which govern editorial content. An editorial issue lives in the Pipeline states; a build-the-system issue lives in triage.
