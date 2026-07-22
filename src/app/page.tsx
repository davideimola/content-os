import Link from "next/link";

import { PieceDetail } from "@/components/detail/piece-detail";
import { TalkDetail } from "@/components/detail/talk-detail";
import { CadenceStrip, CalendarKindIcon, EmptyState, Section } from "@/components/pipeline";
import { TrendChart } from "@/components/trend-chart";
import { MetricTile, StatTile, View } from "@/components/view";
import {
  getCadence,
  getCalendarItems,
  getFlagMix,
  getLiveIdeas,
  getMonthlyMetrics,
  getPieces,
  getTalks,
  type MonthlyMetrics,
} from "@/lib/pipeline";

export const dynamic = "force-dynamic";

const upcomingFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const monthLongFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const monthShortFmt = new Intl.DateTimeFormat("en-GB", { month: "short" });
const numFmt = new Intl.NumberFormat("en-GB");

const asMonth = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00`);

// A percent month-over-month delta, formatted with a tone for MetricTile.
function pctDelta(
  cur: number | null | undefined,
  prev: number | null | undefined,
  prevLabel: string
): { delta: string; tone: "up" | "down" | "neutral" } | undefined {
  if (cur == null || prev == null || prev === 0) return undefined;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return {
    delta: `${pct >= 0 ? "+" : ""}${pct}% vs ${prevLabel}`,
    tone: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
  };
}

// A chart wants points oldest -> newest; the monthly rows come newest-first.
function series(rows: MonthlyMetrics[], pick: (r: MonthlyMetrics) => number | null) {
  return [...rows].reverse().map((r) => ({ month: r.month, value: pick(r) }));
}

export default async function OverviewPage() {
  const [pieces, ideas, talks, cadence, mix, calendar, monthly] = await Promise.all([
    getPieces(),
    getLiveIdeas(),
    getTalks(),
    getCadence(),
    getFlagMix(),
    getCalendarItems(),
    getMonthlyMetrics(),
  ]);

  const proposedPieces = pieces.filter((p) => p.state === "proposed");
  const proposedTalks = talks.filter((t) => t.state === "proposed");
  const proposalsCount = proposedPieces.length + proposedTalks.length;

  const flagPct = mix.total > 0 ? Math.round((mix.flag / mix.total) * 100) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const nextUp = calendar.filter((i) => i.date >= today).slice(0, 5);

  // The LinkedIn tiles + trend track the latest months that actually have LinkedIn
  // data — a site-only month (e.g. a provisional Vercel figure parked ahead of the
  // LinkedIn ingest) must not blank the section (ADR-0019).
  const liMonths = monthly.filter((m) => m.li_impressions != null || m.li_followers != null);
  const latest = liMonths[0];
  const prev = liMonths[1];
  const prevLabel = prev ? monthShortFmt.format(asMonth(prev.month)) : "";

  return (
    <View title="Overview" subtitle={`Flag mix ${flagPct}% · target ~70% · ${mix.total} outputs`}>
      <CadenceStrip cadence={cadence} />

      {latest ? (
        <Section title={`This month on LinkedIn · ${monthLongFmt.format(asMonth(latest.month))}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile
              label="Impressions"
              value={latest.li_impressions != null ? numFmt.format(latest.li_impressions) : "—"}
              {...pctDelta(latest.li_impressions, prev?.li_impressions, prevLabel)}
            />
            <MetricTile
              label="Members reached"
              value={latest.li_reach != null ? numFmt.format(latest.li_reach) : "—"}
              {...pctDelta(latest.li_reach, prev?.li_reach, prevLabel)}
            />
            <MetricTile
              label="Engagements"
              value={numFmt.format(latest.li_engagements)}
              {...pctDelta(latest.li_engagements, prev?.li_engagements, prevLabel)}
            />
            <MetricTile
              label="Followers"
              value={latest.li_followers != null ? numFmt.format(latest.li_followers) : "—"}
              delta={
                latest.li_new_followers != null
                  ? `+${latest.li_new_followers} this month`
                  : undefined
              }
              tone={latest.li_new_followers && latest.li_new_followers > 0 ? "up" : "neutral"}
            />
          </div>
        </Section>
      ) : null}

      {liMonths.length >= 2 ? (
        <Section title="Trend">
          <div className="grid grid-cols-2 gap-3">
            <TrendChart label="Followers" points={series(liMonths, (r) => r.li_followers)} />
            <TrendChart label="Impressions" points={series(liMonths, (r) => r.li_impressions)} />
          </div>
        </Section>
      ) : null}

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
                  <CalendarKindIcon item={item} />
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
