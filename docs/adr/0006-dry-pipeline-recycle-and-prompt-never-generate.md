# Dry pipeline: recycle and prompt, never generate

When the Pipeline cannot feed the Cadence floor for the week — after the Monday
Beat has judged and slotted everything it has, this week's LinkedIn slot is still
uncovered — content-os stays a **router**: it re-surfaces on-voice material it
already holds ([Recycle](../../CONTEXT.md)), and failing that prompts Davide for
one idea, but it **never generates net-new topics**. The trigger is the floor
going undefended, not an empty idea inbox — in-flight `proposed`/`slotted` pieces
mean there is nothing to solve.

## Considered options

- **Generate net-new topics** (rejected): the Beat brainstorms fresh topics from
  the Positioning when the well is dry. Rejected because it is exactly the "brain"
  that [ADR-0002](0002-no-app-repo-plus-claude-routines.md) /
  [ADR-0003](0003-contentos-cli-operations-surface.md) keep out, and it is the
  highest risk for Davide's stated failure mode — a tool that manufactures content
  he does not buy into is "a tool I don't use". It would also make an assertive
  auto-slot unsafe.
- **Recycle, then prompt** (chosen): recycle draws, in priority, from (1) parked
  `idea`s held as thin and (2) content derived from a published blog or an upcoming
  talk — deriving ≠ generating, the topic already passed the voice bar. Because
  every recycled piece is Davide's own material, the Beat can assertively slot
  **exactly one** piece (de-slottable) so "Monday, you know what to do" holds even
  on a dry week. If recycle finds nothing, the Monday plan ping degrades to a prompt
  for one idea — no extra channel, just the week's single ping repurposed.

## Consequences

- The Monday Beat gains a **recycle → prompt** fallback after judge+slot; the
  Thursday guard's at-risk branch degrades to the same prompt when there is no
  proposal to guard. Neither Beat ever generates.
- Recycle defends the weekly **LinkedIn** floor; a dry monthly **blog** falls to
  the prompt, since a blog cannot be honestly recycled.
- A piece Davide de-slots is excluded from future recycling, so the fallback cannot
  loop on rejected material.
