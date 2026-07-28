"use client";

// The by-date view over the Pipeline (#117). It kept only what exists and had no way
// to ask a question of it; it now carries three things it lacked.
//
//   * a **lane** beside the agenda holding the two facts that justify each other — the
//     outputs waiting for a date, and the periods on both Cadence floors that hold
//     nothing. The empty weeks and the candidates that could fill them, one screen.
//   * a **search box**, which Ideas has had all along.
//   * every row opening the drawer of what it stands for, with **no row type second
//     class**: a CFP deadline and an Event carry a glyph and a state in the same columns
//     a Piece row uses (`AgendaRow`, `layout="line"`).
//
// A client module because the search is client state and every row hands its drawer a
// callback (#111). Everything it *derives* arrives computed from the server — "today",
// each row's readiness, both hole lists — so nothing here can disagree with the render
// that produced it. The holes are the Thursday Beat's own predicate projected forward
// (ADR-0021 dec.5): this view reports periods, it never re-defines `covered`.

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { CadenceGaps } from "@/components/cadence-gaps";
import { AgendaRow, ProposalRow, SubmissionRow } from "@/components/drawer-rows";
import { EmptyState } from "@/components/pipeline";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  capped,
  type MonthHole,
  monthLabel,
  type Readiness,
  TUNING,
  type WeekHole,
} from "@/lib/derive";
import type { EngagementContext, PieceMetrics, ThemeContext } from "@/lib/pipeline";
import {
  type CfpSubmission,
  groupRowsByMonth,
  type Proposal,
  proposalKey,
  type Row,
  rowKey,
} from "@/lib/rows";

// What a search looks at: the row's name. See the note at the call site for why a
// Piece's `detail` (its channel) is excluded while a CFP's or Event's is not.
const searchText = (row: Row): string =>
  (row.kind === "piece"
    ? row.item.title
    : `${row.item.title}\n${row.item.detail ?? ""}`
  ).toLowerCase();

const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit" });

// The day of the month, once per day, outside the row — a row is a button and a day
// stamp is not part of what it opens.
function DayStamp({ date, today }: { date: string; today: string }) {
  const d = new Date(`${date}T00:00:00`);
  const isToday = date === today;
  return (
    <span className="w-11 shrink-0 pt-2 text-xs leading-tight">
      <span
        className={isToday ? "text-foreground block font-medium" : "text-muted-foreground block"}
      >
        {isToday ? "today" : weekdayFmt.format(d)}
      </span>
      <span className="text-muted-foreground block tabular-nums">{dayFmt.format(d)}</span>
    </span>
  );
}

type RowRenderProps = {
  engagements: EngagementContext;
  metrics?: Record<string, PieceMetrics>;
  themes: ThemeContext;
  readiness: Record<string, Readiness>;
};

// The agenda: month headings over day rows. One shape for the future and for the past,
// so the past is the same list read the other way round and not a different view.
function Months({ rows, today, render }: { rows: Row[]; today: string; render: RowRenderProps }) {
  return (
    <>
      {groupRowsByMonth(rows).map(({ month, days }) => (
        <section key={month} className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
            {monthLabel(month)}
          </h3>
          <div className="divide-y">
            {days.map(([date, group]) => (
              <div key={date} className="flex items-start gap-2 py-1">
                <DayStamp date={date} today={today} />
                <div className="min-w-0 flex-1">
                  {group.map((row) => (
                    <AgendaRow
                      key={rowKey(row)}
                      row={row}
                      layout="line"
                      engagements={render.engagements}
                      metrics={render.metrics}
                      themes={render.themes}
                      readiness={row.kind === "piece" ? render.readiness[row.item.id] : null}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// A lane card: a heading with its count over a compact list.
function LaneCard({
  title,
  count,
  children,
  footnote,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <Card className="h-fit gap-2.5 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide uppercase">{title}</h2>
        <span className="text-lg font-semibold tabular-nums tracking-tight">{count}</span>
      </div>
      {children}
      {footnote ? <p className="text-muted-foreground text-[0.65rem]">{footnote}</p> : null}
    </Card>
  );
}

// A cap is stated, never silent: a list that just stops reads as "that is all".
function Overflow({ hidden }: { hidden: number }) {
  if (hidden === 0) return null;
  return <p className="text-muted-foreground px-1.5 pt-1 text-xs">+{hidden} more not shown</p>;
}

export function CalendarView({
  rows,
  today,
  proposals,
  linkedinHoles,
  blogHoles,
  holeWeeks,
  holeMonths,
  noDeadline,
  engagements,
  metrics,
  themes,
  readiness,
}: {
  rows: Row[]; // the whole dated agenda, ascending
  today: string;
  proposals: Proposal[];
  linkedinHoles: WeekHole[];
  blogHoles: MonthHole[];
  holeWeeks: number;
  holeMonths: number;
  noDeadline: CfpSubmission[];
  engagements: EngagementContext;
  metrics?: Record<string, PieceMetrics>;
  themes: ThemeContext;
  readiness: Record<string, Readiness>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // The search narrows the **agenda** by title. The lane is untouched: it holds standing
  // facts about what is missing, and hiding a hole because a title does not match it
  // would be a lie of omission.
  //
  // A CFP row's title is its Talk's, so for a non-Piece row the conference behind it
  // counts as part of the name — "GoLab" has to find the GoLab deadline. A Piece's
  // `detail` is its channel, deliberately NOT matched: typing "linkedin" would silently
  // become a channel filter, which is a different feature wearing a search box.
  const found = useMemo(
    () => (q ? rows.filter((r) => searchText(r).includes(q)) : rows),
    [rows, q]
  );

  const upcoming = found.filter((r) => r.item.date >= today);
  const past = found.filter((r) => r.item.date < today).reverse(); // most recent first
  const lane = capped(proposals, TUNING.laneRows);
  const undeadlined = capped(noDeadline, TUNING.laneRows);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[19rem_1fr]">
      {/* The lane. On a phone it stacks ABOVE the agenda — same view, same question,
          different density (ADR-0021): the order of the two is the information
          architecture and does not change with the viewport. */}
      <aside
        aria-label="Waiting for a date, and what is missing"
        className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start"
      >
        <LaneCard
          title="To place"
          count={proposals.length}
          footnote={
            proposals.length > 0
              ? "Proposals with no date. Open one to slot it; whether it earns a date at all is the Desk's call."
              : undefined
          }
        >
          {proposals.length === 0 ? (
            <p className="text-muted-foreground text-xs">Nothing waiting for a date.</p>
          ) : (
            <div className="-mx-1.5 flex flex-col">
              {lane.shown.map((p) => (
                <ProposalRow key={proposalKey(p)} proposal={p} metrics={metrics} themes={themes} />
              ))}
              <Overflow hidden={lane.hidden} />
            </div>
          )}
        </LaneCard>

        {/* The same renderer the home's "Missing ahead" card uses, over a longer week
            horizon — one vocabulary for one fact. Always rendered, including at zero:
            a lane that only appears when something is wrong never tells you the span it
            has been checking, and the card's own zero-state says exactly that. */}
        <CadenceGaps
          linkedin={linkedinHoles}
          blog={blogHoles}
          weeks={holeWeeks}
          months={holeMonths}
        />

        {/* Why a submission Davide remembers making is not on this Calendar. */}
        {noDeadline.length > 0 ? (
          <LaneCard
            title="No deadline"
            count={noDeadline.length}
            footnote="A submission with no deadline carries no date, which is why it does not appear on the Calendar."
          >
            <div className="flex flex-col gap-1.5">
              {undeadlined.shown.map((s) => (
                <SubmissionRow key={s.engagement.id} submission={s} dense />
              ))}
              <Overflow hidden={undeadlined.hidden} />
            </div>
          </LaneCard>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="relative">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the agenda…"
            className="pl-8"
            aria-label="Search the calendar"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState>Nothing dated yet — slot a Piece to see it here.</EmptyState>
        ) : found.length === 0 ? (
          <EmptyState>Nothing on the calendar matches “{query.trim()}”.</EmptyState>
        ) : (
          <>
            {upcoming.length === 0 ? (
              <EmptyState>
                {q
                  ? "No match ahead — the matches are in the past, below."
                  : "Nothing dated ahead."}
              </EmptyState>
            ) : (
              <Months
                rows={upcoming}
                today={today}
                render={{ engagements, metrics, themes, readiness }}
              />
            )}

            {/* Collapsed, not gone (user story 22): what shipped stays one click away
                without the past crowding the future. A search opens it, because a match
                the reader asked for must not be hidden behind a closed section. */}
            {past.length > 0 ? (
              <details open={q !== ""}>
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-1 text-xs font-semibold tracking-wide uppercase">
                  Past · {past.length}
                </summary>
                <div className="mt-3 flex flex-col gap-5 opacity-70">
                  <Months
                    rows={past}
                    today={today}
                    render={{ engagements, metrics, themes, readiness }}
                  />
                </div>
              </details>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
