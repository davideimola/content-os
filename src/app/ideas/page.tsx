import { IdeasView } from "@/components/ideas-view";
import { View } from "@/components/view";
import { todayISO } from "@/lib/derive";
import { getIdeaPool } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  // **One** read (#118). This page used to call `getIdeasWithProvenance()` and
  // `getThemeContext()` side by side, which asked `themes` and `idea_themes` twice per
  // request and built a per-Piece Theme lookup nothing here renders — flagged by #112
  // and again by #120. `getIdeaPool()` reads each table once and returns the pool plus
  // the two Theme facts the view needs: the vocabulary to filter and group by, and
  // which Themes are carried by anything at all (an Idea **or a Piece**, since the
  // output carries Themes too — only a truly unused Theme may be retired, #78/#112).
  const { ideas, vocabulary, inUse } = await getIdeaPool();
  const liveCount = ideas.filter((i) => i.status === "live").length;
  const liveThemeCount = vocabulary.filter((t) => !t.archived).length;

  return (
    // Wide: the pool is cards in columns, not prose — a desktop screen should not be
    // three quarters empty (ADR-0021's responsive rule is unchanged either way, same
    // view and same question at a different density).
    <View title="Ideas" subtitle={`${liveCount} live in the pool · ${liveThemeCount} Themes`} wide>
      {/* `today` is computed here, once, and handed down: the bands are age arithmetic
          and the cards carry an age cue, and a server date passed in is what stops the
          two disagreeing (the same discipline #116 used for readiness marks). */}
      <IdeasView ideas={ideas} themes={vocabulary} themesInUse={inUse} today={todayISO()} />
    </View>
  );
}
