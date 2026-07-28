import { CalendarAgenda } from "@/components/calendar-agenda";
import { View } from "@/components/view";
import {
  getCalendarItems,
  getEngagementContext,
  getPieceMetricsById,
  getPieces,
} from "@/lib/pipeline";
import { buildRows } from "@/lib/rows";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  // The by-date items are the agenda; the Pieces and the Engagement tier are what a
  // row hands its drawer. Built server-side and passed down as plain records (#111).
  const [items, pieces, engagements] = await Promise.all([
    getCalendarItems(),
    getPieces(),
    getEngagementContext(),
  ]);
  const metrics = await getPieceMetricsById(pieces);
  const rows = buildRows(items, pieces);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <View title="Calendar" subtitle={`${items.length} dated items`}>
      <CalendarAgenda rows={rows} today={today} engagements={engagements} metrics={metrics} />
    </View>
  );
}
