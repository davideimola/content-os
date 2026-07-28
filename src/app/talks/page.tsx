import { TalkDetail } from "@/components/detail/talk-detail";
import { SubmissionRow } from "@/components/drawer-rows";
import { EmptyState } from "@/components/pipeline";
import { View } from "@/components/view";
import { getEngagementContext, getTalks } from "@/lib/pipeline";
import { cfpSubmissionsOfTalk } from "@/lib/rows";

export const dynamic = "force-dynamic";

export default async function TalksPage() {
  const [talks, engagements] = await Promise.all([getTalks(), getEngagementContext()]);

  return (
    <View title="Talks" subtitle={`${talks.length} total`}>
      {talks.length === 0 ? (
        <EmptyState>No talks yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {talks.map((t) => (
            <div key={t.id} className="flex flex-col gap-2">
              <TalkDetail talk={t} />
              {/* A Talk's submissions — one Talk, many CFPs (the tier's one-to-many).
                  Each row opens the same CFP drawer a Calendar row does, and it is
                  the only surface a submission with no deadline is reachable from:
                  with no deadline it carries no date, so it never reaches the
                  Calendar. */}
              {cfpSubmissionsOfTalk(engagements, t.id).map((s) => (
                <SubmissionRow key={s.engagement.id} submission={s} />
              ))}
            </div>
          ))}
        </div>
      )}
    </View>
  );
}
