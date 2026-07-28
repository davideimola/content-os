import { CalendarView } from "@/components/calendar-view";
import { View } from "@/components/view";
import { blogHolesAhead, linkedinHolesAhead, readinessById, TUNING, todayISO } from "@/lib/derive";
import {
  getEngagementContext,
  getPieceMetricsById,
  getPieces,
  getTalks,
  getThemeContext,
} from "@/lib/pipeline";
import { buildRows, calendarItems, cfpsWithoutDeadline, undatedProposals } from "@/lib/rows";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  // Four reads, and the by-date agenda is derived from two of them rather than read
  // again: `calendarItems` projects the Pieces and the Engagement tier this view needs
  // anyway to hand each row its drawer (#111 left that fold-in here). Everything handed
  // to the view is plain records, which is what survives the RSC boundary (#111).
  const [pieces, talks, engagements, themes] = await Promise.all([
    getPieces(),
    getTalks(),
    getEngagementContext(),
    getThemeContext(),
  ]);
  const metrics = await getPieceMetricsById(pieces);

  // One "today" for the whole console — a local calendar date, not a UTC instant, since
  // week and month boundaries are the whole point of this view (`todayISO`).
  const today = todayISO();
  const rows = buildRows(calendarItems(pieces, engagements), pieces);

  // Readiness is derived HERE, on the server, and handed to the rows by id: it is
  // arithmetic over `today`, and computing it beside the render that decided `today`
  // is what stops the two disagreeing (#116).
  const readiness = readinessById(pieces, today);

  // What is missing, on both floors: the Thursday Beat's own definition of `covered`
  // projected forward (ADR-0021 dec.5). The Calendar reads a longer week horizon than
  // the home — the same predicate over more weeks, because this is where a date gets
  // placed (`TUNING.calendarHoleWeeks`).
  const linkedinHoles = linkedinHolesAhead(pieces, today, TUNING.calendarHoleWeeks);
  const blogHoles = blogHolesAhead(pieces, today);

  const ahead = rows.filter((r) => r.item.date >= today).length;
  const behind = rows.length - ahead;

  return (
    <View title="Calendar" subtitle={`${ahead} dated ahead · ${behind} past`} wide>
      <CalendarView
        rows={rows}
        today={today}
        proposals={undatedProposals(pieces, talks)}
        linkedinHoles={linkedinHoles}
        blogHoles={blogHoles}
        holeWeeks={TUNING.calendarHoleWeeks}
        holeMonths={TUNING.blogHoleMonths}
        noDeadline={cfpsWithoutDeadline(engagements)}
        engagements={engagements}
        metrics={metrics}
        themes={themes}
        readiness={readiness}
      />
    </View>
  );
}
