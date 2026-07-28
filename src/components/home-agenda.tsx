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
  const { shown, hidden } = capped(rows, TUNING.agendaRows);

  // The count the cadence pills can never show: dated, close, and nothing written.
  const readiness = rows.map((row) =>
    row.kind === "piece" && row.piece ? readinessOf(row.piece, today) : null
  );
  const unwritten = readiness.filter((r) => r?.key === "late" || r?.key === "not_written").length;
  const missed = readiness.filter((r) => r?.key === "missed").length;

  if (rows.length === 0) {
    return <EmptyState>Nothing dated in the next {TUNING.agendaDays} days.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {shown.map((row, i) => (
          <li key={rowKey(row)} className="flex items-start gap-2">
            <DateStamp date={row.item.date} today={today} />
            <div className="min-w-0 flex-1">
              <AgendaRow
                row={row}
                engagements={engagements}
                metrics={metrics}
                themes={themes}
                readiness={readiness[i]}
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
      {missed > 0 ? (
        <p className="px-1 text-xs text-red-700 dark:text-red-400">
          {missed} date already passed with nothing shipped.
        </p>
      ) : null}
    </div>
  );
}
