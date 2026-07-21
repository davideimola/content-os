import Link from "next/link";

import { PieceDetail } from "@/components/detail/piece-detail";
import { TalkDetail } from "@/components/detail/talk-detail";
import { CadenceStrip, EmptyState, Section } from "@/components/pipeline";
import { StatTile, View } from "@/components/view";
import {
  getCadence,
  getCalendarItems,
  getFlagMix,
  getLiveIdeas,
  getPieces,
  getTalks,
} from "@/lib/pipeline";

export const dynamic = "force-dynamic";

const upcomingFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

export default async function OverviewPage() {
  const [pieces, ideas, talks, cadence, mix, calendar] = await Promise.all([
    getPieces(),
    getLiveIdeas(),
    getTalks(),
    getCadence(),
    getFlagMix(),
    getCalendarItems(),
  ]);

  const proposedPieces = pieces.filter((p) => p.state === "proposed");
  const proposedTalks = talks.filter((t) => t.state === "proposed");
  const proposalsCount = proposedPieces.length + proposedTalks.length;

  const flagPct = mix.total > 0 ? Math.round((mix.flag / mix.total) * 100) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const nextUp = calendar.filter((i) => i.date >= today).slice(0, 5);

  return (
    <View title="Overview" subtitle={`Flag mix ${flagPct}% · target ~70% · ${mix.total} outputs`}>
      <CadenceStrip cadence={cadence} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="To judge"
          value={proposalsCount}
          href="/pipeline"
          accent={proposalsCount > 0}
        />
        <StatTile label="Ideas" value={ideas.length} href="/ideas" />
        <StatTile label="Pieces" value={pieces.length} href="/pipeline" />
        <StatTile label="Talks" value={talks.length} href="/talks" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="To judge" count={proposalsCount}>
          {proposalsCount === 0 ? (
            <EmptyState>No proposals waiting — the pool is quiet.</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {proposedPieces.map((p) => (
                <PieceDetail key={p.id} piece={p} />
              ))}
              {proposedTalks.map((t) => (
                <TalkDetail key={t.id} talk={t} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Next up">
          {nextUp.length === 0 ? (
            <EmptyState>Nothing scheduled ahead.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {nextUp.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
                    {upcomingFmt.format(new Date(`${item.date}T00:00:00`))}
                  </span>
                  <span className="flex-1 truncate text-sm">{item.title}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {item.kind === "cfp" ? "CFP" : (item.detail ?? item.kind)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/calendar" className="text-muted-foreground hover:text-foreground text-xs">
            Open calendar →
          </Link>
        </Section>
      </div>
    </View>
  );
}
