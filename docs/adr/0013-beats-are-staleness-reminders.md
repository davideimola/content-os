# The Beats are deterministic staleness reminders, not autonomous planners

ADR-0010 built the three Beats as autonomous sessions — GATHER (`gh`) → DECIDE (one free-Gemini REST
call) → APPLY (labels / board / ping). In practice the autonomous judgment was overbuilt: the
interactive **Desk** (ADR-0007) plans far better because Davide is in the loop, and once every Idea is
captured (ADR-0011), a live Desk session beats an autonomous plan. We decided the Beats **stop
deciding** and become **deterministic reminders**: each detects staleness from observable facts and
pings Davide to run the interactive session that does the real work. This removes Gemini from the Beats
entirely.

## Decisions

1. **All three Beats become deterministic staleness/schedule reminders.** No autonomous editorial
   judgment; ADR-0010's `gather → decide (Gemini) → apply` collapses to **detect → ping**. Gemini — and
   `GEMINI_API_KEY`, its free-tier quota, its data terms — leaves the Beats.
   - **Monday** → "time to plan: run `/desk`" when unjudged Ideas have piled up.
   - **Thursday** → "this week's LinkedIn slot is open" (cadence at risk) → run `/desk` / ship one.
     Already reminder-shaped; it loses the Gemini "most-ready piece" pick.
   - **Monthly** → "import metrics + run `/review`" when last month's `metrics/` is missing.
2. **Staleness is derived from observable facts** (`gh` + the repo), with **no maintained state file** —
   avoiding a new artifact to keep in sync (the "tool I don't use" trap, ADR-0002). Signals: the last
   `published` Piece's date (cadence floor — blog > 1 month, social > 1 week), the count of open
   unjudged Ideas (planning backlog), and the presence of `metrics/<last-month>/` (import due). A Beat
   never tracks "when Desk last ran" — it tracks whether there is work Desk would resolve.
3. **A new interactive skill `/review` is created**, the sibling of `/desk` (ADR-0007) — the interactive
   counterpart the Monthly reminder points to. It reuses `monthly-beat.md`'s procedure (metrics ritual →
   `contentos metrics-ingest` → cross with the Calendar → mix vs ~70% / Cadence vs floor →
   number-cited recommendations), run live with Davide. **Thursday needs no new skill** — its reminder
   points to `/desk`.

## Considered Options

- **Keep the autonomous Beats** (ADR-0010): rejected — the autonomous judgment was overbuilt; the
  interactive Desk/Review do it better with Davide in the loop, and a free Flash-Lite model on nuanced
  editorial calls was a standing quality risk. Reminders + interactive judgment is simpler and better.
- **A maintained declarative state file** for staleness: rejected — another artifact to keep in sync,
  the "tool I don't use" trap (ADR-0002). Derive from observable facts instead.
- **No monthly interactive counterpart** (point to the manual ritual): rejected — the review is a
  structured ritual with a tool step (`metrics-ingest`), 12×/year; a guided `/review` (sibling of
  `/desk`) keeps it consistent and reuses `monthly-beat.md`.

## Consequences

- **Supersedes ADR-0010's decide step.** The Beats become pure deterministic bash — `gh` staleness
  checks + `notify_ping` (the notify seam, ADR-0009, stays; it's how the reminder pings). `beats.yml`
  drops `GEMINI_API_KEY`; the `gather/decide/apply` scripts collapse to detect/ping.
- **The autonomous monthly digest is gone**; its analysis moves into the interactive `/review`. A
  trade-off accepted: interactive > autonomous.
- **`monthly-beat.md` becomes `/review`'s procedure** (as `monday-beat.md` is the Desk's); the beat docs
  turn from "autonomous decide prompt" into "staleness trigger + which interactive session to nudge".
- **CONTEXT.md** revises **Beat** (a reminder, not an autonomous session) and **Desk**, and adds
  **Review**.
- **Execution** (rework the beat scripts + `beats.yml`, write `/review`, rewrite the beat docs) rides
  with the ADR-0011/0012 build — a sizable multi-step change, not done here.
