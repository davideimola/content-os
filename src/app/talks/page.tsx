import { EmptyState, TalkCard } from "@/components/pipeline";
import { View } from "@/components/view";
import { getTalks } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function TalksPage() {
  const talks = await getTalks();

  return (
    <View title="Talks" subtitle={`${talks.length} total`}>
      {talks.length === 0 ? (
        <EmptyState>No talks yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {talks.map((t) => (
            <TalkCard key={t.id} talk={t} />
          ))}
        </div>
      )}
    </View>
  );
}
