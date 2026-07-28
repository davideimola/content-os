import Link from "next/link";

import { AgendaRow } from "@/components/drawer-rows";
import { EmptyState } from "@/components/pipeline";
import { capped, readinessOf, TUNING } from "@/lib/derive";
import type { EngagementContext, PieceMetrics, ThemeContext } from "@/lib/pipeline";
import { type Row, rowKey } from "@/lib/rows";

// The home's agenda: what is coming at Davide, every row carrying its readiness and
// opening the drawer of the thing it stands for (#111). The window is a rolling seven
// days plus anything already missed — see `TUNING.agendaDays` for why the home's week
// is rolling while the cadence floors stay on calendar periods.
//
// A Server Component: the rows are the client modules, and "today" is decided here,
// once, on the server.
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const dayMonthFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

function DateStamp({ date, today }: { date: string; today: string }) {
  const d = new Date(`${date}T00:00:00`);
  const isToday = date === today;
  return (
    <span className="w-12 shrink-0 pt-3.5 text-xs leading-tight">
      <span
        className={isToday ? "text-foreground block font-medium" : "text-muted-foreground block"}
      >
        {isToday ? "today" : weekdayFmt.format(d)}
      </span>
      <span className="text-muted-foreground block tabular-nums">{dayMonthFmt.format(d)}</span>
    </span>
  );
}

export function HomeAgenda({
  rows,
  today,
  engagements,
  metrics,
  themes,
}: {
  rows: Row[]; // already narrowed to the window, in date order
  today: string;
  engagements: EngagementContext;
  metrics?: Record<string, PieceMetrics>;
  themes: ThemeContext;
}) {
  // Readiness per row, computed once: it is what each row displays AND what the two
  // counts below are folded from.
  const marked = rows.map((row) => ({
    row,
    readiness: row.kind === "piece" && row.piece ? readinessOf(row.piece, today) : null,
  }));

  // A missed date is exempt from the row cap — a backlog of them must not push the
  // week out of view, which is the one thing the cap exists to protect.
  const behind = marked.filter((m) => m.readiness?.key === "missed");
  const { shown, hidden } = capped(
    marked.filter((m) => m.readiness?.key !== "missed"),
    TUNING.agendaRows
  );
  const listed = [...behind, ...shown];

  // The count the cadence pills can never show: dated, close, and nothing written.
  const unwritten = marked.filter(
    (m) => m.readiness?.key === "late" || m.readiness?.key === "not_written"
  ).length;

  if (rows.length === 0) {
    return <EmptyState>Nothing dated in the next {TUNING.agendaDays} days.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {listed.map(({ row, readiness }) => (
          <li key={rowKey(row)} className="flex items-start gap-2">
            <DateStamp date={row.item.date} today={today} />
            <div className="min-w-0 flex-1">
              <AgendaRow
                row={row}
                engagements={engagements}
                metrics={metrics}
                themes={themes}
                readiness={readiness}
              />
            </div>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <Link href="/calendar" className="text-muted-foreground hover:text-foreground px-1 text-xs">
          +{hidden} more dated in these {TUNING.agendaDays} days — open the calendar →
        </Link>
      ) : null}

      {unwritten > 0 ? (
        <p className="px-1 text-xs text-amber-700 dark:text-amber-400">
          {unwritten} dated in the next {TUNING.agendaDays} days with nothing written yet.
        </p>
      ) : null}
      {behind.length > 0 ? (
        <p className="px-1 text-xs text-red-700 dark:text-red-400">
          {behind.length === 1
            ? "1 date already passed with nothing shipped."
            : `${behind.length} dates already passed with nothing shipped.`}
        </p>
      ) : null}
    </div>
  );
}
