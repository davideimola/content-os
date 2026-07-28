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

import { CalendarClock } from "lucide-react";

import { CardTrigger, type DetailTrigger, RowTrigger } from "@/components/detail/detail-sheet";
import { CfpDetail, EventDetail } from "@/components/detail/engagement-detail";
import { PieceDetail } from "@/components/detail/piece-detail";
import { calendarKindMeta, formatDate, OutcomeBadge } from "@/components/pipeline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CalendarItem, EngagementContext, PieceMetrics, ThemeContext } from "@/lib/pipeline";
import { type CfpSubmission, cfpSubmission, type Row } from "@/lib/rows";

function KindBadge({ item }: { item: CalendarItem }) {
  const { icon: Icon, label, variant } = calendarKindMeta(item);
  return (
    <Badge variant={variant} className="gap-1">
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

// What an agenda row shows, drawer or not: the title, its kind, its state, and for a
// CFP or Event the conference behind it.
function AgendaBody({ item }: { item: CalendarItem }) {
  return (
    <Card className="gap-2 p-3.5">
      <p className="text-sm leading-snug font-medium text-pretty">{item.title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <KindBadge item={item} />
        {item.state ? (
          <span className="text-muted-foreground text-xs">{item.state.replace("_", " ")}</span>
        ) : null}
        {item.kind !== "piece" && item.detail ? (
          <span className="text-muted-foreground text-xs">· {item.detail}</span>
        ) : null}
      </div>
    </Card>
  );
}

// One agenda row. `engagements`, `metrics` and `themes` are the plain-record lookups
// the row needs to hand its drawer the full record behind the date.
export function AgendaRow({
  row,
  engagements,
  metrics,
  themes,
}: {
  row: Row;
  engagements: EngagementContext;
  metrics?: Record<string, PieceMetrics>;
  themes: ThemeContext;
}) {
  const body = <AgendaBody item={row.item} />;
  // The row is the opener. `id` keeps the anchor-target behaviour a card trigger has,
  // so a link to `#<id>` still scrolls the row into view and flashes it (#76).
  const asRow: DetailTrigger = (open) => (
    <CardTrigger id={row.item.id} onClick={open}>
      {body}
    </CardTrigger>
  );

  if (row.kind === "piece") {
    if (!row.piece) return body; // no Piece behind the date — nothing to open
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
    if (!event) return body;
    return (
      <EventDetail event={event} talks={engagements.talksByEvent[event.id] ?? []} trigger={asRow} />
    );
  }

  const submission = cfpSubmission(engagements, row.item.id);
  if (!submission) return body;
  return <CfpDetail submission={submission} trigger={asRow} />;
}

// One submission under a Talk: the conference, the deadline (or the fact there is
// none) and the outcome — opening the same CFP drawer a Calendar row opens.
export function SubmissionRow({ submission }: { submission: CfpSubmission }) {
  const { engagement, event } = submission;
  return (
    <CfpDetail
      submission={submission}
      trigger={(open) => (
        <RowTrigger onClick={open} className="rounded-lg border px-3 py-2">
          <CalendarClock aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
          <span className="flex-1 truncate text-xs">{event?.name ?? "Unknown event"}</span>
          {engagement.deadline ? (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {formatDate(engagement.deadline)}
            </span>
          ) : (
            <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">no deadline</span>
          )}
          <OutcomeBadge outcome={engagement.outcome} />
        </RowTrigger>
      )}
    />
  );
}
