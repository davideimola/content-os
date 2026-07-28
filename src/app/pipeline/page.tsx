import { PieceDetail } from "@/components/detail/piece-detail";
import { TalkDetail } from "@/components/detail/talk-detail";
import { EmptyState, Section } from "@/components/pipeline";
import { View } from "@/components/view";
import {
  getPieceMetricsById,
  getPieces,
  getTalks,
  PIECE_STATE_ORDER,
  type PieceState,
  type PieceWithBlocker,
} from "@/lib/pipeline";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<PieceState, string> = {
  proposed: "Proposed",
  slotted: "Slotted",
  ready: "Ready",
  published: "Published",
  declined: "Declined",
};

export default async function PipelinePage() {
  const [pieces, talks] = await Promise.all([getPieces(), getTalks()]);
  const metrics = await getPieceMetricsById(pieces);

  const proposedPieces = pieces.filter((p) => p.state === "proposed");
  const proposedTalks = talks.filter((t) => t.state === "proposed");
  const proposalsCount = proposedPieces.length + proposedTalks.length;

  const boardStates = PIECE_STATE_ORDER.filter((s) => s !== "proposed");
  const byState = new Map<PieceState, PieceWithBlocker[]>(
    boardStates.map((s) => [s, pieces.filter((p) => p.state === s)])
  );

  return (
    <View title="Pipeline" subtitle={`${pieces.length} pieces · ${talks.length} talks`}>
      {/* Lifecycle board — one column per state; stacks on mobile, spreads on desktop. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Section title="To judge" count={proposalsCount}>
          {proposalsCount === 0 ? (
            <EmptyState>No proposals waiting — the pool is quiet.</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {proposedPieces.map((p) => (
                <PieceDetail key={p.id} piece={p} metrics={metrics[p.id]} />
              ))}
              {proposedTalks.map((t) => (
                <TalkDetail key={t.id} talk={t} />
              ))}
            </div>
          )}
        </Section>

        {boardStates.map((state) => {
          const items = byState.get(state) ?? [];
          return (
            <Section key={state} title={STATE_LABEL[state]} count={items.length}>
              {items.length === 0 ? (
                <EmptyState>Nothing {STATE_LABEL[state].toLowerCase()}.</EmptyState>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((p) => (
                    <PieceDetail key={p.id} piece={p} metrics={metrics[p.id]} />
                  ))}
                </div>
              )}
            </Section>
          );
        })}
      </div>
    </View>
  );
}
