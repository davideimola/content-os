"use client";

// Talks as **talk-as-asset** (#119, prototype verdict: variant A, decided against live
// data). The view was not badly laid out, it was half missing: it rendered the Talks and
// the CFPs were nowhere in it, so the one-to-many the model has had since init — one
// Talk, many submissions, each to its own Event — had never been visible anywhere.
//
// One sheet per Talk, in a grid that fills a wide screen. The Talk is the spine and its
// submissions live **inside** it, which is what makes the card a self-contained asset
// rather than a title with a list hanging off it. Everything on the sheet opens the
// drawer of what it stands for: the header opens the Talk (so a garbled title is
// repaired where it is noticed), each submission row opens the Engagement.
//
// A client module because the cap is client state and every row hands its drawer a
// callback (#111). The row *model* stays pure in `src/lib/rows.ts`, and the lookup it is
// handed is plain records — a `Map` does not survive the RSC payload.

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { SubmitToEvent } from "@/components/detail/submit-to-event";
import { TalkDetail } from "@/components/detail/talk-detail";
import { SubmissionRow } from "@/components/drawer-rows";
import { EmptyState, FlagBadge, StateBadge } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { capped, TUNING } from "@/lib/derive";
import type { EngagementContext, EventRecord, Talk } from "@/lib/pipeline";
import { cfpSubmissionsOfTalk, invitationsOfTalk } from "@/lib/rows";

// One Talk, whole: its own state and the submissions taken from it.
function AssetSheet({
  talk,
  engagements,
  events,
}: {
  talk: Talk;
  engagements: EngagementContext;
  events: EventRecord[];
}) {
  const [expanded, setExpanded] = useState(false);

  const submissions = cfpSubmissionsOfTalk(engagements, talk.id);
  const { shown, hidden } = expanded
    ? { shown: submissions, hidden: 0 }
    : capped(submissions, TUNING.talkSubmissions);
  const undeadlined = submissions.filter((s) => s.engagement.deadline == null).length;
  const invitations = invitationsOfTalk(engagements, talk.id);

  return (
    // `h-full` against the grid's `auto-rows-fr`: every sheet in a row is the height of
    // the tallest, so a Talk with one submission does not sit in a short card beside a
    // tall one. The cap is what keeps that height bounded.
    <Card className="h-full gap-0 p-0">
      {/* The Talk itself — the whole header is the opener, and renaming and the ladder
          both live in the drawer it opens. Its own trigger rather than `CardTrigger` /
          `RowTrigger`: this opener is a column inside a card, neither of the two shapes
          those primitives exist for. */}
      <TalkDetail
        talk={talk}
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className="hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full cursor-pointer flex-col items-start gap-2 p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="text-sm leading-snug font-medium text-pretty">{talk.title}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <StateBadge state={talk.state} />
              <FlagBadge flagSide={talk.flag_side} />
            </span>
          </button>
        )}
      />

      {/* Its submissions — the one-to-many, inside the asset instead of hanging off it.
          `flex-1` pushes the creation button to the foot of the sheet, so the same
          action sits in the same place on every card in the grid. */}
      <div className="flex flex-1 flex-col gap-1.5 border-t p-4">
        {/* A label, deliberately not a heading: the Talk's title is what names this card
            and it lives in the trigger above, so a heading here would put N identical
            "Submissions" into heading navigation with no owner. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-[0.65rem] font-semibold tracking-wide uppercase">
            Submissions
          </span>
          {/* The TRUE count, always — the cap below hides rows, never the number. */}
          <span className="text-sm font-semibold tabular-nums">{submissions.length}</span>
        </div>

        {submissions.length === 0 ? (
          <p className="text-muted-foreground text-xs">Not submitted anywhere yet.</p>
        ) : (
          shown.map((s) => <SubmissionRow key={s.engagement.id} submission={s} dense />)
        )}

        {/* Never truncate silently: say how many are behind the click, both ways. */}
        {hidden > 0 ? (
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground -ml-2 w-fit"
            onClick={() => setExpanded(true)}
          >
            <ChevronDown />+{hidden} more submission{hidden === 1 ? "" : "s"}
          </Button>
        ) : null}
        {expanded && submissions.length > TUNING.talkSubmissions ? (
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground -ml-2 w-fit"
            onClick={() => setExpanded(false)}
          >
            <ChevronUp />
            Show fewer
          </Button>
        ) : null}

        {/* A missing deadline is *why* a submission cannot be found on the Calendar —
            the cause stated where the submission is, not left to be noticed there.
            Counted over ALL of them, so a capped-away one is still reported. */}
        {undeadlined > 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {undeadlined} with no deadline — invisible on the Calendar.
          </p>
        ) : null}

        {/* An invitation (`direct`) is not a submission and has no surface here — see
            `invitationsOfTalk` for why. Stated so the omission is never silent. */}
        {invitations > 0 ? (
          <p className="text-muted-foreground text-xs">
            {invitations} invitation{invitations === 1 ? "" : "s"} not shown here — the console
            records submissions only.
          </p>
        ) : null}

        <SubmitToEvent talk={talk} events={events} className="mt-auto pt-2" />
      </div>
    </Card>
  );
}

export function TalksView({
  talks,
  engagements,
  events,
}: {
  talks: Talk[];
  engagements: EngagementContext;
  events: EventRecord[];
}) {
  if (talks.length === 0) {
    // No creation affordance, deliberately: a talk coming to mind is a spark, and a
    // spark goes through a capture door (`/idea` or an AI app). The console may create
    // the Engagement tier around a Talk; it may not spawn the Talk.
    return <EmptyState>No talks yet — a talk starts as a captured Idea.</EmptyState>;
  }

  return (
    // Equal heights from the breakpoint the second column appears at, not before it: in a
    // single column every card is its own row, so `auto-rows-fr` there would stretch a
    // Talk with no submissions to the tallest card in the whole list — dead space on the
    // phone, where it costs most. Uniformity is a fact about a row of cards.
    <div className="grid grid-cols-1 gap-3 md:auto-rows-fr md:grid-cols-2 xl:grid-cols-3">
      {talks.map((talk) => (
        <AssetSheet key={talk.id} talk={talk} engagements={engagements} events={events} />
      ))}
    </div>
  );
}
