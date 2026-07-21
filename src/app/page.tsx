import {
  CadenceStrip,
  EmptyState,
  IdeaCard,
  PieceCard,
  Section,
  TalkCard,
} from "@/components/pipeline";
import {
  getCadence,
  getFlagMix,
  getLiveIdeas,
  getPieces,
  getTalks,
  PIECE_STATE_ORDER,
  type Piece,
  type PieceState,
} from "@/lib/pipeline";

// Always read fresh from Supabase — the Pipeline is live, not build-time content.
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<PieceState, string> = {
  proposed: "Proposed",
  slotted: "Slotted",
  in_production: "In production",
  published: "Published",
  declined: "Declined",
};

export default async function Home() {
  const [pieces, ideas, talks, cadence, mix] = await Promise.all([
    getPieces(),
    getLiveIdeas(),
    getTalks(),
    getCadence(),
    getFlagMix(),
  ]);

  const proposedPieces = pieces.filter((p) => p.state === "proposed");
  const proposedTalks = talks.filter((t) => t.state === "proposed");
  const proposalsCount = proposedPieces.length + proposedTalks.length;

  // The board: Pieces grouped by lifecycle state, proposals shown separately above.
  const boardStates = PIECE_STATE_ORDER.filter((s) => s !== "proposed");
  const byState = new Map<PieceState, Piece[]>(
    boardStates.map((s) => [s, pieces.filter((p) => p.state === s)])
  );

  const flagPct = mix.total > 0 ? Math.round((mix.flag / mix.total) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-5 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Content OS</h1>
        <p className="text-muted-foreground text-sm">
          Flag mix {flagPct}% · target ~70% · {mix.total} outputs
        </p>
      </header>

      <CadenceStrip cadence={cadence} />

      <Section title="To judge" count={proposalsCount}>
        {proposalsCount === 0 ? (
          <EmptyState>No proposals waiting — the pool is quiet.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {proposedPieces.map((p) => (
              <PieceCard key={p.id} piece={p} />
            ))}
            {proposedTalks.map((t) => (
              <TalkCard key={t.id} talk={t} />
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
                  <PieceCard key={p.id} piece={p} />
                ))}
              </div>
            )}
          </Section>
        );
      })}

      <Section title="Talks" count={talks.length}>
        {talks.length === 0 ? (
          <EmptyState>No talks yet.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {talks.map((t) => (
              <TalkCard key={t.id} talk={t} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Ideas" count={ideas.length}>
        {ideas.length === 0 ? (
          <EmptyState>The pool is empty.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {ideas.map((i) => (
              <IdeaCard key={i.id} idea={i} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
