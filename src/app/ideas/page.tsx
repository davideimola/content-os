import { IdeasView } from "@/components/ideas-view";
import { View } from "@/components/view";
import { getIdeasWithProvenance, getThemeContext } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  // The theme context carries the vocabulary and `inUse` — every theme carried by any
  // Idea **or Piece**, since the output carries Themes too (#112). Only a truly unused
  // theme may be retired (#78), so deriving that from the Ideas alone would offer to
  // retire a theme a Piece still carries.
  const [ideas, themes] = await Promise.all([getIdeasWithProvenance(), getThemeContext()]);
  const liveCount = ideas.filter((i) => i.status === "live").length;

  return (
    <View title="Ideas" subtitle={`${liveCount} live in the pool`}>
      <IdeasView ideas={ideas} themes={themes.vocabulary} usedThemeIds={themes.inUse} />
    </View>
  );
}
