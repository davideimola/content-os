import { TalkDetail } from "@/components/detail/talk-detail";
import { SubmissionRow } from "@/components/drawer-rows";
import { EmptyState } from "@/components/pipeline";
import { View } from "@/components/view";
import { getEngagementContext, getTalks } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function TalksPage() {
  const [talks, engagements] = await Promise.all([getTalks(), getEngagementContext()]);

  return (
    <View title="Talks" subtitle={`${talks.length} total`}>
      {talks.length === 0 ? (
        <EmptyState>No talks yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {talks.map((t) => {
            // A Talk's submissions — one Talk, many CFPs (the tier's one-to-many).
            // Each row opens the same CFP drawer a Calendar row does, which is the
            // only place a submission with no deadline is reachable at all: with no
            // deadline it carries no date, so it never reaches the Calendar.
            // `cfp` only, the same filter the Calendar's read applies: a `direct`
            // engagement is an invitation, not a submission, and nothing creates one.
            const submissions = (engagements.engagementsByTalk[t.id] ?? []).filter(
              (e) => e.kind === "cfp"
            );
            return (
              <div key={t.id} className="flex flex-col gap-2">
                <TalkDetail talk={t} />
                {submissions.map((e) => (
                  <SubmissionRow
                    key={e.id}
                    engagement={e}
                    event={engagements.events[e.event_id] ?? null}
                    talk={engagements.talkByEngagement[e.id] ?? null}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </View>
  );
}
