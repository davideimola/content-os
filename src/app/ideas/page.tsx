import { EmptyState, IdeaCard } from "@/components/pipeline";
import { View } from "@/components/view";
import { getLiveIdeas } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const ideas = await getLiveIdeas();

  return (
    <View title="Ideas" subtitle={`${ideas.length} live in the pool`}>
      {ideas.length === 0 ? (
        <EmptyState>The pool is empty.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {ideas.map((i) => (
            <IdeaCard key={i.id} idea={i} />
          ))}
        </div>
      )}
    </View>
  );
}
