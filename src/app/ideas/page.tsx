import { IdeaDetail } from "@/components/detail/idea-detail";
import { EmptyState } from "@/components/pipeline";
import { View } from "@/components/view";
import { getIdeasWithProvenance } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const ideas = await getIdeasWithProvenance();

  return (
    <View title="Ideas" subtitle={`${ideas.length} live in the pool`}>
      {ideas.length === 0 ? (
        <EmptyState>The pool is empty.</EmptyState>
      ) : (
        <div className="grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {ideas.map((i) => (
            <IdeaDetail key={i.id} idea={i} />
          ))}
        </div>
      )}
    </View>
  );
}
