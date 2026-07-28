import { TalksView } from "@/components/talks-view";
import { View } from "@/components/view";
import { getEngagementContext, getTalks } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// Talk-as-asset (#119): the read, then the grid. Two reads cover the whole view — the
// Talks and the Engagement tier whole — and the projection over them is pure
// (`cfpSubmissionsOfTalk`, `invitationsOfTalk`), done in the client module that renders
// it from the same plain-record context every drawer is handed.
//
// There is deliberately **no way to spawn a Talk from here**. A talk coming to mind is a
// spark and goes through a capture door (`/idea`, or an AI app — ADR-0008/0014); the
// console creates the Engagement tier *around* an existing Talk and never the Talk
// itself. `spawn_talk` appears nowhere in this app.
export default async function TalksPage() {
  const [talks, engagements] = await Promise.all([getTalks(), getEngagementContext()]);
  const events = Object.values(engagements.events);
  const submissions = Object.values(engagements.engagements).filter((e) => e.kind === "cfp").length;

  return (
    <View
      title="Talks"
      subtitle={`${talks.length} talks · ${submissions} submissions · ${events.length} events`}
      wide
    >
      <TalksView talks={talks} engagements={engagements} events={events} />
    </View>
  );
}
