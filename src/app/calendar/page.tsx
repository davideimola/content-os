import { CalendarAgenda } from "@/components/calendar-agenda";
import { View } from "@/components/view";
import { getCalendarItems } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const items = await getCalendarItems();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <View title="Calendar" subtitle={`${items.length} dated items`}>
      <CalendarAgenda items={items} today={today} />
    </View>
  );
}
