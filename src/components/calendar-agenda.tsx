import { AgendaRow } from "@/components/drawer-rows";
import { EmptyState } from "@/components/pipeline";
import type { EngagementContext, PieceMetrics, ThemeContext } from "@/lib/pipeline";
import { groupRowsByDate, type Row, rowKey } from "@/lib/rows";

const fmtHeading = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function heading(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : fmtHeading.format(d);
}

function DayGroup({
  date,
  rows,
  engagements,
  metrics,
  themes,
}: {
  date: string;
  rows: Row[];
  engagements: EngagementContext;
  metrics?: Record<string, PieceMetrics>;
  themes: ThemeContext;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
        {heading(date)}
      </h3>
      {rows.map((row) => (
        <AgendaRow
          key={rowKey(row)}
          row={row}
          engagements={engagements}
          metrics={metrics}
          themes={themes}
        />
      ))}
    </div>
  );
}

// The by-date agenda: every row opens the drawer of the thing it stands for — a Piece
// with all its actions, an Event with the Talks taken to it, a CFP with its submission
// (#111). A Server Component: the rows themselves are the client modules.
export function CalendarAgenda({
  rows,
  today,
  engagements,
  metrics,
  themes,
}: {
  rows: Row[];
  today: string;
  engagements: EngagementContext;
  metrics?: Record<string, PieceMetrics>;
  themes: ThemeContext;
}) {
  if (rows.length === 0) {
    return <EmptyState>Nothing dated yet — slot a Piece to see it here.</EmptyState>;
  }

  const upcoming = rows.filter((r) => r.item.date >= today); // ascending already
  const past = rows.filter((r) => r.item.date < today).reverse(); // most recent first

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold tracking-tight">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState>Nothing scheduled ahead.</EmptyState>
        ) : (
          groupRowsByDate(upcoming).map(([date, group]) => (
            <DayGroup
              key={date}
              date={date}
              rows={group}
              engagements={engagements}
              metrics={metrics}
              themes={themes}
            />
          ))
        )}
      </section>

      {past.length > 0 ? (
        <section className="flex flex-col gap-5 opacity-70">
          <h2 className="text-sm font-semibold tracking-tight">Past</h2>
          {groupRowsByDate(past).map(([date, group]) => (
            <DayGroup
              key={date}
              date={date}
              rows={group}
              engagements={engagements}
              metrics={metrics}
              themes={themes}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
