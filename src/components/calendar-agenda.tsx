import { CalendarClock, FileText, Mic } from "lucide-react";
import { EmptyState } from "@/components/pipeline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CalendarItem } from "@/lib/pipeline";

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

function KindBadge({ item }: { item: CalendarItem }) {
  if (item.kind === "cfp") {
    return (
      <Badge variant="destructive" className="gap-1">
        <CalendarClock aria-hidden />
        CFP deadline
      </Badge>
    );
  }
  if (item.kind === "event") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Mic aria-hidden />
        Event
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <FileText aria-hidden />
      {item.detail ?? "piece"}
    </Badge>
  );
}

function DayGroup({ date, items }: { date: string; items: CalendarItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
        {heading(date)}
      </h3>
      {items.map((item) => (
        <Card key={`${item.kind}-${item.id}`} className="gap-2 p-3.5">
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
      ))}
    </div>
  );
}

function groupByDate(items: CalendarItem[]): [string, CalendarItem[]][] {
  const map = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const arr = map.get(it.date) ?? [];
    arr.push(it);
    map.set(it.date, arr);
  }
  return [...map.entries()];
}

export function CalendarAgenda({ items, today }: { items: CalendarItem[]; today: string }) {
  if (items.length === 0) {
    return <EmptyState>Nothing dated yet — slot a Piece to see it here.</EmptyState>;
  }

  const upcoming = items.filter((i) => i.date >= today); // ascending already
  const past = items.filter((i) => i.date < today).reverse(); // most recent first

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold tracking-tight">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState>Nothing scheduled ahead.</EmptyState>
        ) : (
          groupByDate(upcoming).map(([date, group]) => (
            <DayGroup key={date} date={date} items={group} />
          ))
        )}
      </section>

      {past.length > 0 ? (
        <section className="flex flex-col gap-5 opacity-70">
          <h2 className="text-sm font-semibold tracking-tight">Past</h2>
          {groupByDate(past).map(([date, group]) => (
            <DayGroup key={date} date={date} items={group} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
