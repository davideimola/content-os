import { IdeasView } from "@/components/ideas-view";
import { View } from "@/components/view";
import { getIdeasWithProvenance } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const ideas = await getIdeasWithProvenance();
  const liveCount = ideas.filter((i) => i.status === "live").length;

  return (
    <View title="Ideas" subtitle={`${liveCount} live in the pool`}>
      <IdeasView ideas={ideas} />
    </View>
  );
}
