# Monday planning Beat: triage, slot the week, ping the plan

The first of the three [Beats](../../CONTEXT.md) — a scheduled proactive session that runs every
Monday morning, works the [Pipeline](../../CONTEXT.md) on its own, and pings Davide once with the
week's plan. One arc: **judge new [Ideas](../../CONTEXT.md) → propose → check overlap → slot the week
on the [Calendar](../../CONTEXT.md) → (recycle or prompt if the week is dry) → ping the plan**. So
Monday starts with Davide knowing exactly what to do (user stories 5–11).

Like the rest of the system it splits **hands from brain** (ADR-0003): the deterministic moves go
through `gh` and the [notify seam](notify.md) (they never judge), and the editorial judgement — what is worth
proposing, where it goes, what the week looks like — is *this prompt*. The Beat **never drafts
content** (ADR-0002, user story 27): it judges and routes; the Factory writing skills write.

## What it runs against

- **Reads:** open `idea` issues (the inbox), plus open pipeline issues and recent `published` ones
  for the overlap check and the week view.
- **Writes:** state/dimension labels on issues (see the [taxonomy](pipeline-taxonomy.md)), items and
  fields on the [Calendar board](calendar.md), and exactly **one** Telegram ping via the
  [notify seam](notify.md).
- Issues stay the source of truth (ADR-0001); the board is the by-date view.

The Beat **runs on GitHub Actions cron** (ADR-0010, see [Scheduling](#scheduling-ac4)); the body below
is the decide prompt, independent of the trigger.

## Preconditions

- `gh` installed and authenticated, with the `repo` **and** `project` scopes (the board lives under
  `gh project`, see [calendar.md](calendar.md)).
- `jq` available (the beat scripts parse JSON with it), and `curl` for the ping.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the environment for the ping (CI secrets,
  never committed).

## The procedure

**1 — Gather.** Fetch the inbox and the context for judgement:

```sh
# new, unjudged ideas — the work to triage
gh issue list --repo davideimola/content-os --label idea --state open \
  --json number,title,body,createdAt
# in-flight pieces — OR the state labels via search (repeated --label is AND, and states are
# mutually exclusive, so --label a --label b would always return nothing)
gh issue list --repo davideimola/content-os --state open \
  --search "label:proposed,slotted,in-production" --json number,title,labels
# recent shipped — context for the overlap check
gh issue list --repo davideimola/content-os --state all --label published \
  --json number,title --limit 30
```

**2 — Judge each Idea** with the editorial signal framework (below). For each idea, decide:

- **Strong** (a thesis that matches the voice) → promote to `proposed`, assign **Flag/Side** and a
  **channel**, and remove `idea`:
  ```sh
  gh issue edit <n> --repo davideimola/content-os \
    --add-label proposed,flag,linkedin --remove-label idea
  ```
  (choose `flag`/`side` and one channel `blog`/`linkedin`/`talk` per the [taxonomy](pipeline-taxonomy.md);
  sharpen the title if it helps, but **do not** write the piece.)
- **Promising but thin** → keep `idea`; add a **comment** naming the one thing that would sharpen it
  (the missing thesis, the hook).
- **Off-voice / stale / duplicate** → **close** the idea with a one-line why (`gh issue close`); keep
  it out of the plan.

Judge with the Pipeline's own labels and comments only — the engineering triage labels
(`needs-info`, `wontfix`, …) are orthogonal to editorial content and stay off Ideas (see the
[taxonomy](pipeline-taxonomy.md#triage-vs-pipeline-labels)).

**3 — Overlap check** (user story 7). Compare each fresh `proposed` against the `published` set and
the open pipeline. If it duplicates a shipped piece or an in-flight one, link them in a comment and
either angle it differently or merge (comment + `gh issue close` the newcomer). Never let the same
piece be written twice.

**4 — Slot the week on the Calendar.** Defend the [Cadence](../../CONTEXT.md) **floor** — at least
**1 LinkedIn post this week** and **blog progress** (1/month) — steering the mix toward **~70% Flag**.
For each piece to publish or advance this week, put it on the board and date it (recipes in
[calendar.md](calendar.md#cli-recipes-for-the-beats)):

```sh
# label first — the issue is the source of truth (calendar.md: "the label wins"); then mirror to the board
gh issue edit <n> --repo davideimola/content-os --add-label slotted --remove-label proposed
item=$(gh project item-add 2 --owner davideimola --url <issue-url> --format json --jq .id)
gh project item-edit --project-id <pid> --id "$item" --field-id <date-fid> --date <this-week>
gh project item-edit --project-id <pid> --id "$item" --field-id <stage-fid> --single-select-option-id <slotted>
```

**5 — Defend a dry week (recycle, then prompt).** Runs **only** if, after step 4, this week's
[Cadence](../../CONTEXT.md) floor is still uncovered — no `idea`, no `proposed`, and no
`slotted`/`in-production` `linkedin` piece can carry this week's LinkedIn slot. In-flight pieces mean
the week is fine; skip this step. This is the **dry-pipeline fallback**
([ADR-0006](../adr/0006-dry-pipeline-recycle-and-prompt-never-generate.md)): content-os
[recycles](../../CONTEXT.md) on-voice material it already holds and **never generates a new topic**.

- **Recycle** (defends the weekly LinkedIn floor). Find **one** piece to slot, drawing in priority from:
  1. a **parked `idea`** previously held as thin — now worth reviving with the sharpening it lacked;
  2. else an **angle derived from a published blog or an upcoming talk** — an amplifier LinkedIn post
     off shipped work (deriving ≠ generating; the topic already passed the voice bar).

  If one is found, promote and slot it exactly like a judged idea (`proposed` + Flag/Side + `linkedin`,
  then `slotted` + a `Date` this week) — **exactly one**, always de-slottable. **Exclude** any piece
  Davide has previously **de-slotted**: a de-slot is a "no", so never re-recycle it.
- **Prompt** (fallback of the fallback). If recycle finds nothing usable, do **not** invent a topic —
  the week's single plan ping (step 6) degrades to a one-line prompt for input.
- **Scope.** A dry monthly **blog** floor is **not** recycled (a blog cannot be honestly recycled) — it
  falls to the prompt.

**6 — Ping the plan.** One ping via the [notify seam](notify.md) with the week's plan: a one-line summary, then each
actionable item with a **direct link** (the issue URL, or the board's `This week` view). Keep it
scannable (see the [ping format](notify.md#ping-format)). On a **dry week** this same single ping is
either the **recycle pick, naming its source** ("nothing new this week → slotted an amplifier of your
blog *X*"), or — if recycle found nothing — the **prompt**: one line, one move ("pipeline's dry, the
week's LinkedIn is open → capture one idea, Perplexity ~20s"). Still exactly one ping, still no guilt.

```sh
notify_ping "Monday plan — 1 LinkedIn + blog draft this week.
LinkedIn: <thesis> → <issue url>
Blog: <thesis> (draft) → <issue url>
Board: https://github.com/users/davideimola/projects/2"
```

Treat the Cadence as a **floor, never a ceiling** (user story 14): a light week is rescued, a heavy
week celebrated — the ping never guilt-trips.

## Editorial signal framework

Four signals turn a raw idea into a judgement (they mirror the Factory's `editorial-route` skill so
the HQ and the Factories judge the same way):

| Signal | The question | Pulls toward |
| --- | --- | --- |
| **Thesis vs observation** | Is there a claim to defend, or just a noticing? | A thesis is publishable now; a bare observation needs a hook first. |
| **Heat** | Is it timely — does it carry energy right now? | Hot → slot it sooner. |
| **Narrative material** | Is there a real story or lived experience behind it? | Story-backed pieces are the strongest; route them to the blog. |
| **Voice match** | Does it fit the [Positioning](../../CONTEXT.md)? | On-flag → `flag`; legitimate off-flag → deliberate `side`; off-voice → drop. |

The signals set the routing, not the wording: a story-heavy thesis tends to `blog` (the canonical
home), a sharp single-point take tends to `linkedin` (the amplifier), a big arc tends to a `talk`.

## Scheduling (AC4)

The trigger is **GitHub Actions cron** (ADR-0010): `cron: '0 6 * * 1'` — 06:00 UTC, ≈ 08:00
Europe/Rome in summer. Each run is separated bash — GATHER (`gh`) → DECIDE (one free-Gemini REST call)
→ APPLY (`gh` + a Telegram `curl`) — with the beat body above as the decide prompt. `gh` authenticates
from the `GH_PROJECT_PAT` secret, and the ping proves the run reached Davide. See
[beat-scheduling.md](beat-scheduling.md) for the workflow, secrets, and model.

## Verification (tracker seam, dry-run)

No unit tests — a Beat is a prompt (the spec's Testing Decisions). Verify by **driving it on a seeded
Pipeline** and checking outcomes at the tracker seam:

1. Seed a few `idea` issues of varied strength; run steps 1–6 by hand.
2. Assert: strong ideas are now `proposed` with a Flag/Side **and** a channel, weak ones stayed
   `idea`/`needs-info` (AC1); the week's pieces are on board #2 with a `Date` this week and a `Stage`
   (AC2); a ping reached the phone via the notify seam with the plan summary and direct links (AC3).
3. Clean up the seed (close the test issues, archive the board items).

**Dry-week branch** ([ADR-0006](../adr/0006-dry-pipeline-recycle-and-prompt-never-generate.md)) — two
sub-cases:

1. **Recycle:** seed a week with **no** slottable `linkedin` material but **one** parked-thin `idea`;
   run steps 1–6 and assert that parked idea is recycled — promoted, `slotted` this week, and named as
   a dry-week pick in the ping.
2. **Prompt:** remove that idea too so nothing is recyclable; re-run and assert the ping degrades to a
   one-line prompt for input, with **nothing** slotted and no topic invented.

Not yet dry-run verified — pending its own seeded run.

Verified **2026-07-17** on three seeded ideas: two promoted with a Flag/Side and a channel and
slotted this week on board #2, one held as `idea` with a sharpening comment; the week's plan ping was
delivered via the notify seam (exit 0). Seed cleaned up afterwards. The trigger (AC4) is GitHub
Actions cron (ADR-0010) — the body here is the decide prompt.
