import { IdeasView } from "@/components/ideas-view";
import { View } from "@/components/view";
import { getIdeasWithProvenance, getThemes } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const [ideas, themes] = await Promise.all([getIdeasWithProvenance(), getThemes()]);
  const liveCount = ideas.filter((i) => i.status === "live").length;
  // Themes tagged on any Idea — only a truly unused theme may be archived (#78).
  const usedThemeIds = [...new Set(ideas.flatMap((i) => i.themes.map((t) => t.id)))];

  return (
    <View title="Ideas" subtitle={`${liveCount} live in the pool`}>
      <IdeasView ideas={ideas} themes={themes} usedThemeIds={usedThemeIds} />
    </View>
  );
}
