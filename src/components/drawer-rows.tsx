"use client";

// Rows that open drawers (#111). Davide notices something on a list and wants to act
// on it there, so every row that stands for something opens that thing's drawer — the
// same drawer its card would open, with the same actions.
//
// This is a **client module** by necessity: a row hands the drawer a `trigger`
// (`DetailTrigger`), and a callback cannot be passed from a Server Component into a
// Client one. The row *model* stays pure in `src/lib/rows.ts` so a Server Component
// can still build it, and every lookup handed in here is a plain record — a `Map`
// does not survive the RSC payload.

import { CalendarClock, CalendarOff, Mic } from "lucide-react";

import { CardTrigger, type DetailTrigger, RowTrigger } from "@/components/detail/detail-sheet";
import { CfpDetail, EventDetail } from "@/components/detail/engagement-detail";
import { PieceDetail } from "@/components/detail/piece-detail";
import { TalkDetail } from "@/components/detail/talk-detail";
import {
  CalendarKindIcon,
  ChannelBadge,
  calendarKindMeta,
  formatDate,
  OutcomeBadge,
  StateBadge,
} from "@/components/pipeline";
import { ReadinessBadge } from "@/components/readiness";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Readiness } from "@/lib/derive";
import type { CalendarItem, EngagementContext, PieceMetrics, ThemeContext } from "@/lib/pipeline";
import {
  asEngagementOutcome,
  asPieceState,
  asTalkState,
  type CfpSubmission,
  cfpSubmission,
  type Proposal,
  type Row,
} from "@/lib/rows";
import { cn } from "@/lib/utils";

// One compact row's padding, shared by every line-layout row so the Calendar's agenda
// and its lane sit on the same rhythm.
const LINE_ROW = "items-start gap-2.5 px-1.5 py-2";

function KindBadge({ item }: { item: CalendarItem }) {
  const { icon: Icon, label, variant } = calendarKindMeta(item);
  return (
    <Badge variant={variant} className="gap-1">
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

// The state of the thing on the date — one column, whatever the row is, so no row type
// is second class (#117). Every value comes from `item.state`, which the by-date
// projection decided (`calendarItems`), so nothing is re-derived here; the kind only
// says which vocabulary the string belongs to and therefore which badge renders it:
//
//   piece → its lifecycle state        (StateBadge)
//   cfp   → the submission's outcome   (OutcomeBadge — which is not the Talk's readiness)
//   event → the readiness of the Talk being taken to it, least ready where several
//           share the Event (set by `eventTalkReadiness`)
//
// The Event's badge is `StateBadge` over a Talk state, the one renderer for that fact
// everywhere (#115), prefixed with the word `talk` so a `ready` badge on a conference
// row cannot be read as the conference itself being ready.
function RowStateMark({ row }: { row: Row }) {
  const { kind, item } = row;

  if (kind === "piece") {
    const state = asPieceState(item.state);
    return state ? <StateBadge state={state} /> : <RawState value={item.state} />;
  }

  if (kind === "cfp") {
    const outcome = asEngagementOutcome(item.state);
    return outcome ? <OutcomeBadge outcome={outcome} /> : <RawState value={item.state} />;
  }

  const talkState = asTalkState(item.state);
  if (!talkState) {
    // No Talk accepted there yet, so there is no work left to report — which is not the
    // same as saying nothing was submitted.
    return <span className="text-muted-foreground text-xs">no talk accepted</span>;
  }
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground text-xs">talk</span>
      <StateBadge state={talkState} />
    </span>
  );
}

// A state string that is not one of its kind's values — shown verbatim rather than
// dropped, so an unexpected value is visible instead of silently absent.
function RawState({ value }: { value: string | null }) {
  if (!value) return null;
  return <span className="text-muted-foreground text-xs">{value.replace("_", " ")}</span>;
}

// The two marks every row carries, in the same order everywhere: what is derived about
// the date (`readiness`, #116 — optional and additive, omitted by a caller with no
// notion of today) BESIDE the state of record, never instead of it.
function RowMarks({
  row,
  readiness,
  className,
}: {
  row: Row;
  readiness?: Readiness | null;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {readiness ? <ReadinessBadge readiness={readiness} /> : null}
      <RowStateMark row={row} />
    </span>
  );
}

// What an agenda row shows, drawer or not: the title, its kind, its state, and for a
// CFP or Event the conference behind it.
function AgendaCard({ row, readiness }: { row: Row; readiness?: Readiness | null }) {
  const { item } = row;
  return (
    <Card className="gap-2 p-3.5">
      <p className="text-sm leading-snug font-medium text-pretty">{item.title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <KindBadge item={item} />
        <RowMarks row={row} readiness={readiness} />
        {item.kind !== "piece" && item.detail ? (
          <span className="text-muted-foreground text-xs">· {item.detail}</span>
        ) : null}
      </div>
    </Card>
  );
}

// The same facts as one line, for a list long enough to read as a quarter (#117): the
// kind as a glyph instead of a badge, the title with the conference behind it, and the
// marks at the end. On a phone the marks fall under the title — different density, same
// row: the day stamp stays outside, in the day group the row belongs to.
function AgendaLine({ row, readiness }: { row: Row; readiness?: Readiness | null }) {
  const { item } = row;
  return (
    <>
      <CalendarKindIcon item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="truncate text-sm">
          {item.title}
          {item.kind !== "piece" && item.detail ? (
            <span className="text-muted-foreground"> · {item.detail}</span>
          ) : null}
        </span>
        <RowMarks row={row} readiness={readiness} className="sm:ml-auto sm:justify-end" />
      </span>
    </>
  );
}

// One agenda row. `engagements`, `metrics` and `themes` are the plain-record lookups
// the row needs to hand its drawer the full record behind the date; `readiness` is
// the derived mark, computed by the caller (which knows what "today" is) and passed
// in — this module must not compute a date on the client, where it would disagree
// with the server render.
//
// `layout` is the density, not a different row: `card` for a short list with room (the
// home's week), `line` for the Calendar's months. Both show the same facts through the
// same marks.
export function AgendaRow({
  row,
  engagements,
  metrics,
  themes,
  readiness,
  layout = "card",
}: {
  row: Row;
  engagements: EngagementContext;
  metrics?: Record<string, PieceMetrics>;
  themes: ThemeContext;
  readiness?: Readiness | null;
  layout?: "card" | "line";
}) {
  const line = layout === "line";
  const body = line ? (
    <AgendaLine row={row} readiness={readiness} />
  ) : (
    <AgendaCard row={row} readiness={readiness} />
  );
  // The row is the opener. `id` keeps the anchor-target behaviour a card trigger has,
  // so a link to `#<id>` still scrolls the row into view and flashes it (#76).
  const asRow: DetailTrigger = (open) =>
    line ? (
      <RowTrigger onClick={open} id={row.item.id} className={LINE_ROW}>
        {body}
      </RowTrigger>
    ) : (
      <CardTrigger id={row.item.id} onClick={open}>
        {body}
      </CardTrigger>
    );

  // Nothing to open: the row still renders, in its own layout — a date whose record
  // could not be resolved stays visible rather than dropping out of the agenda.
  const inert = line ? (
    <div className={cn("flex w-full items-start gap-2.5", LINE_ROW)}>{body}</div>
  ) : (
    body
  );

  if (row.kind === "piece") {
    if (!row.piece) return inert; // no Piece behind the date — nothing to open
    return (
      <PieceDetail
        piece={row.piece}
        metrics={metrics?.[row.piece.id]}
        themes={themes}
        trigger={asRow}
      />
    );
  }

  if (row.kind === "event") {
    const event = engagements.events[row.item.id];
    if (!event) return inert;
    return (
      <EventDetail event={event} talks={engagements.talksByEvent[event.id] ?? []} trigger={asRow} />
    );
  }

  const submission = cfpSubmission(engagements, row.item.id);
  if (!submission) return inert;
  return <CfpDetail submission={submission} trigger={asRow} />;
}

// ── the lane's rows (#117) ────────────────────────────────────────────────────
// An output with no date, opening the same drawer its card opens — which is where the
// date gets set, so the lane is a place to act and not just a reminder. The Calendar
// asks *when*; the home's "To judge" cards ask *whether* about the same set.
export function ProposalRow({
  proposal,
  metrics,
  themes,
}: {
  proposal: Proposal;
  metrics?: Record<string, PieceMetrics>;
  themes: ThemeContext;
}) {
  if (proposal.kind === "talk") {
    const { talk } = proposal;
    return (
      <TalkDetail
        talk={talk}
        trigger={(open) => (
          <RowTrigger onClick={open} className={LINE_ROW}>
            <Mic aria-hidden className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
            <span className="flex-1 text-xs leading-snug text-pretty">{talk.title}</span>
          </RowTrigger>
        )}
      />
    );
  }

  const { piece } = proposal;
  return (
    <PieceDetail
      piece={piece}
      metrics={metrics?.[piece.id]}
      themes={themes}
      trigger={(open) => (
        <RowTrigger onClick={open} className={LINE_ROW}>
          <CalendarOff aria-hidden className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="text-xs leading-snug text-pretty">{piece.title}</span>
            <ChannelBadge channel={piece.channel} />
          </span>
        </RowTrigger>
      )}
    />
  );
}

// One submission under a Talk: the conference, the deadline (or the fact there is
// none) and the outcome — opening the same CFP drawer a Calendar row opens.
//
// `dense` is the narrow-column density (the Calendar's lane, #117): the conference name
// gets its own line above the marks instead of competing with them for a 19rem column,
// where a one-line row leaves a conference reading "ComeT…". Same facts either way.
export function SubmissionRow({
  submission,
  dense,
}: {
  submission: CfpSubmission;
  dense?: boolean;
}) {
  const { engagement, event } = submission;
  const deadline = engagement.deadline ? (
    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
      {formatDate(engagement.deadline)}
    </span>
  ) : (
    <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">no deadline</span>
  );
  return (
    <CfpDetail
      submission={submission}
      trigger={(open) => (
        <RowTrigger
          onClick={open}
          className={cn("rounded-lg border px-3 py-2", dense && "items-start")}
        >
          <CalendarClock
            aria-hidden
            className={cn("text-muted-foreground size-3.5 shrink-0", dense && "mt-0.5")}
          />
          {dense ? (
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="text-xs leading-snug text-pretty">
                {event?.name ?? "Unknown event"}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {deadline}
                <OutcomeBadge outcome={engagement.outcome} />
              </span>
            </span>
          ) : (
            <>
              <span className="flex-1 truncate text-xs">{event?.name ?? "Unknown event"}</span>
              {deadline}
              <OutcomeBadge outcome={engagement.outcome} />
            </>
          )}
        </RowTrigger>
      )}
    />
  );
}
