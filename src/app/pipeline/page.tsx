import { PieceDetail } from "@/components/detail/piece-detail";
import { TalkDetail } from "@/components/detail/talk-detail";
import { EmptyState, Section } from "@/components/pipeline";
// PROTOTYPE (#86) — throwaway: three "seeing the flow" variants mounted on this
// route behind `?variant=`, with `?demo=1` for synthetic stuck cases. Remove the
// three imports below, the variant switch, and the switcher to get main back.
import { VariantA, VariantB, VariantC, VariantD } from "@/components/prototype-flow";
// PROTOTYPE (#104) — the per-Piece flow re-prototype: three timeline treatments
// over the seven contract-permitted cases, behind `?variant=E|F|G`.
import { VariantE, VariantF, VariantG } from "@/components/prototype-rungs";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { View } from "@/components/view";
import {
  getLinkedinPosts,
  getPieces,
  getSiteMetrics,
  getTalks,
  PIECE_STATE_ORDER,
  type Piece,
  type PieceMetrics,
  type PieceState,
  sumByPostUrl,
} from "@/lib/pipeline";
import { protoCases, protoDeclinedCases } from "@/lib/prototype-cases";
import { demoPieces } from "@/lib/prototype-demo";

export const dynamic = "force-dynamic";

// PROTOTYPE (#104) — the cases are built here (Server Component) and handed to
// the client bench, the same way `?demo=1` already works.
function RungVariant({
  variant,
  today,
  showVerb,
  act,
  openCase,
}: {
  variant: "E" | "F" | "G";
  today: string;
  showVerb: boolean;
  act: "strict" | "dated";
  openCase?: string;
}) {
  const cases = protoCases(today);
  const declined = protoDeclinedCases(today);
  const props = { cases, declined, showVerb, act, openCase };
  if (variant === "E") return <VariantE {...props} />;
  if (variant === "F") return <VariantF {...props} />;
  return <VariantG {...props} />;
}

const STATE_LABEL: Record<PieceState, string> = {
  proposed: "Proposed",
  slotted: "Slotted",
  ready: "Ready",
  published: "Published",
  declined: "Declined",
};

// PROTOTYPE (#86) — the variant roster for the floating switcher.
const PROTO_VARIANTS = [
  { key: "live", name: "Current board" },
  { key: "A", name: "Flow rail + joints" },
  { key: "B", name: "Attention list" },
  { key: "C", name: "Per-Piece journey" },
  { key: "D", name: "Flow board (drag & drop)" },
  // PROTOTYPE (#104) — the rungs and their sub-lines.
  { key: "E", name: "Rungs — prose sub-lines" },
  { key: "F", name: "Rungs — fact chips" },
  { key: "G", name: "Rungs — current rung only" },
];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    variant?: string;
    demo?: string;
    verb?: string;
    act?: string;
    open?: string;
  }>;
}) {
  const sp = await searchParams;
  const variant = PROTO_VARIANTS.some((v) => v.key === sp.variant)
    ? (sp.variant as string)
    : "live";
  const demo = sp.demo === "1";
  // PROTOTYPE (#104) — Q4 (does the sub-line name the verb?) and the two readings
  // of #95 dec.2's activation, both flippable from the switcher bar.
  const showVerb = sp.verb === "1";
  const act = sp.act === "dated" ? "dated" : "strict";

  const [livePieces, talks, liPosts, site] = await Promise.all([
    getPieces(),
    getTalks(),
    getLinkedinPosts(),
    getSiteMetrics(),
  ]);

  // `today` travels from the server so the flag rules render identically on both passes.
  const today = new Date().toISOString().slice(0, 10);
  const pieces = demo ? [...livePieces, ...demoPieces(today)] : livePieces;

  // Per-Piece metrics: a linkedin Piece's linked post summed across months; a blog
  // Piece's publish-month site visitors (site-wide — no per-post site data, ADR-0019).
  const byUrl = sumByPostUrl(liPosts);
  const siteByMonth = new Map(site.map((s) => [s.month.slice(0, 7), s.visitors]));
  const metricsFor = (p: Piece): PieceMetrics | undefined => {
    if (p.channel === "linkedin") {
      return { linkedin: p.linkedin_post_url ? (byUrl.get(p.linkedin_post_url) ?? null) : null };
    }
    if (p.channel === "blog" && p.publish_date) {
      return { siteVisitors: siteByMonth.get(p.publish_date.slice(0, 7)) ?? null };
    }
    return undefined;
  };

  const proposedPieces = pieces.filter((p) => p.state === "proposed");
  const proposedTalks = talks.filter((t) => t.state === "proposed");
  const proposalsCount = proposedPieces.length + proposedTalks.length;

  const boardStates = PIECE_STATE_ORDER.filter((s) => s !== "proposed");
  const byState = new Map<PieceState, Piece[]>(
    boardStates.map((s) => [s, pieces.filter((p) => p.state === s)])
  );

  return (
    <View
      title="Pipeline"
      subtitle={`${pieces.length} pieces · ${talks.length} talks${demo ? " · demo data on" : ""}`}
    >
      {/* PROTOTYPE (#86) — one of three flow variants, or the live board. */}
      {variant === "A" ? <VariantA pieces={pieces} today={today} /> : null}
      {variant === "B" ? <VariantB pieces={pieces} today={today} /> : null}
      {variant === "C" ? <VariantC pieces={pieces} today={today} /> : null}
      {variant === "D" ? (
        <VariantD
          pieces={pieces}
          today={today}
          metrics={Object.fromEntries(pieces.map((p) => [p.id, metricsFor(p)]))}
        />
      ) : null}
      {/* PROTOTYPE (#104) — the three rung treatments over the seven cases. */}
      {variant === "E" || variant === "F" || variant === "G" ? (
        <RungVariant
          variant={variant}
          today={today}
          showVerb={showVerb}
          act={act}
          openCase={sp.open}
        />
      ) : null}
      <PrototypeSwitcher
        variants={PROTO_VARIANTS}
        current={variant}
        demo={demo}
        toggles={
          variant === "E" || variant === "F" || variant === "G"
            ? [
                {
                  param: "verb",
                  label: "verb",
                  on: "1",
                  active: showVerb,
                  title: "name the RPC verb that leaves each rung (Q4)",
                },
                {
                  param: "act",
                  label: "act: dated",
                  on: "dated",
                  active: act === "dated",
                  title: "activate the flow on a date too, not only on a production fact",
                },
              ]
            : []
        }
      />

      {/* Lifecycle board — one column per state; stacks on mobile, spreads on desktop. */}
      {variant !== "live" ? null : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Section title="To judge" count={proposalsCount}>
            {proposalsCount === 0 ? (
              <EmptyState>No proposals waiting — the pool is quiet.</EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                {proposedPieces.map((p) => (
                  <PieceDetail key={p.id} piece={p} metrics={metricsFor(p)} />
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
                      <PieceDetail key={p.id} piece={p} metrics={metricsFor(p)} />
                    ))}
                  </div>
                )}
              </Section>
            );
          })}
        </div>
      )}
    </View>
  );
}
