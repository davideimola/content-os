import { CadenceGaps } from "@/components/cadence-gaps";
import { PieceDetail } from "@/components/detail/piece-detail";
import { TalkDetail } from "@/components/detail/talk-detail";
import { HomeAgenda } from "@/components/home-agenda";
import { CadenceStrip, EmptyState, Section } from "@/components/pipeline";
import { FlagMixBar, OutputByMonth, WrittenVsDatedBar } from "@/components/production";
import { TrendChart } from "@/components/trend-chart";
import { MetricTile, View } from "@/components/view";
import {
  agendaWindowRows,
  blogHolesAhead,
  linkedinHolesAhead,
  monthLabel,
  outputByMonth,
  todayISO,
  writtenVsDated,
} from "@/lib/derive";
import {
  cumulativeFollowerGrowth,
  getCadence,
  getEngagementContext,
  getFlagMix,
  getLatestFollowerLevel,
  getLinkedinPosts,
  getLiveIdeas,
  getMonthlyMetrics,
  getPieceMetricsById,
  getPieces,
  getTalks,
  getThemeContext,
  type MonthlyMetrics,
} from "@/lib/pipeline";
import { buildRows, calendarItems } from "@/lib/rows";
import { formatObservedOn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// The home is the console's primary occasion: Davide opens it at a ping, glances and
// closes it. So it is a dashboard, in one order — how it is going (the month's
// LinkedIn numbers), what he is producing (output, the mix against its target, how
// much of what is dated is written), the cadence floors, the week beside what is
// missing ahead, then the proposals to judge.
//
// Everything here is arithmetic over dates, states and counts (ADR-0021): nothing
// ranks an Idea, nothing suggests what to write. The derivations live in
// `src/lib/derive.ts`, where the four tuning dials are named in one place.

const monthShortFmt = new Intl.DateTimeFormat("en-GB", { month: "short" });
const numFmt = new Intl.NumberFormat("en-GB");

const asMonth = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00`);
const cell = (n: number | null | undefined) => (n != null ? numFmt.format(n) : "—");

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

// Equal-height card in a grid: a detail component renders its own card inside a
// trigger button, so the height has to be pushed down through both.
function EqualHeight({ children }: { children: React.ReactNode }) {
  return <div className="[&>button]:h-full [&_[data-slot=card]]:h-full">{children}</div>;
}

export default async function OverviewPage() {
  const [pieces, ideas, talks, cadence, mix, monthly, themes, followerLevel, engagements, posts] =
    await Promise.all([
      getPieces(),
      getLiveIdeas(),
      getTalks(),
      getCadence(),
      getFlagMix(),
      getMonthlyMetrics(),
      getThemeContext(),
      getLatestFollowerLevel(),
      getEngagementContext(),
      getLinkedinPosts(),
    ]);
  const metrics = await getPieceMetricsById(pieces);

  const today = todayISO();

  const proposedPieces = pieces.filter((p) => p.state === "proposed");
  const proposedTalks = talks.filter((t) => t.state === "proposed");
  const proposalsCount = proposedPieces.length + proposedTalks.length;

  // ── what he is producing, and what is missing ──────────────────────────────
  const written = writtenVsDated(pieces, today);
  const months = outputByMonth(pieces, today);
  const liHoles = linkedinHolesAhead(pieces, today);
  const blogHoles = blogHolesAhead(pieces, today);

  // ── the week ───────────────────────────────────────────────────────────────
  // The by-date agenda is derived from the Pieces and the Engagement tier already read
  // above — the same pure projection the Calendar uses, so neither view reads those
  // tables twice for it (#117).
  const agenda = agendaWindowRows(buildRows(calendarItems(pieces, engagements), pieces), today);

  // ── the month's LinkedIn numbers ───────────────────────────────────────────
  // The tiles track the latest month that actually has LinkedIn data — a site-only
  // month (e.g. a provisional Vercel figure parked ahead of the LinkedIn ingest) must
  // not blank the section (ADR-0019).
  const liMonths = monthly.filter((m) => m.li_impressions != null || m.li_new_followers != null);
  const latest = liMonths[0];
  const prev = liMonths[1];
  const prevLabel = prev ? monthShortFmt.format(asMonth(prev.month)) : "";

  // A month with no per-post ingest reads as **no data**, not as zero engagements.
  // `getMonthlyMetrics` defaults per-month engagements to 0 where every other field
  // uses null (the fix at the source is #120's); the post rows themselves are the
  // honest presence test, so the home asks them rather than trusting the 0.
  const ingestedEngagementMonths = new Set(posts.map((p) => p.month.slice(0, 7)));
  const engagementsOf = (row: MonthlyMetrics | undefined): number | null =>
    row && ingestedEngagementMonths.has(row.month.slice(0, 7)) ? row.li_engagements : null;

  return (
    <View
      title="Overview"
      subtitle={`${ideas.length} live Ideas · ${pieces.length} Pieces · ${talks.length} Talks`}
      wide
    >
      {/* 1. How is it going — the month's numbers first, with the trend beside them.
          The Followers tile lives in this row but is NOT conditional on it: the level
          is a standing fact with its own observation date, true whether or not a month
          has been ingested (#113). */}
      <Section
        title={
          latest
            ? `This month on LinkedIn · ${monthLabel(latest.month.slice(0, 7))}`
            : "This month on LinkedIn · no month ingested yet"
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <MetricTile
            label="Impressions"
            value={cell(latest?.li_impressions)}
            {...pctDelta(latest?.li_impressions, prev?.li_impressions, prevLabel)}
          />
          <MetricTile
            label="Members reached"
            value={cell(latest?.li_reach)}
            {...pctDelta(latest?.li_reach, prev?.li_reach, prevLabel)}
          />
          <MetricTile
            label="Engagements"
            value={cell(engagementsOf(latest))}
            {...pctDelta(engagementsOf(latest), engagementsOf(prev), prevLabel)}
          />
          {/* The LEVEL carries the date it was observed, never the month's key: the
              export reports the total at export time, so it belongs to that day
              (#113). The month's growth sits beside it, named by its month, because
              the two facts are true at two different times. */}
          <MetricTile
            label={
              followerLevel
                ? `Followers · ${formatObservedOn(followerLevel.observed_on)}`
                : "Followers · never observed"
            }
            value={followerLevel ? numFmt.format(followerLevel.total) : "—"}
            delta={
              latest?.li_new_followers != null
                ? `+${numFmt.format(latest.li_new_followers)} in ${monthShortFmt.format(asMonth(latest.month))}`
                : undefined
            }
            tone={latest?.li_new_followers && latest.li_new_followers > 0 ? "up" : "neutral"}
          />
          {/* Cumulative GROWTH, not a level series: each step is the month's exact
              new_followers, so the slope is true from the first month with data. */}
          <TrendChart
            label="Follower growth"
            points={cumulativeFollowerGrowth(liMonths)}
            height={44}
          />
          <TrendChart
            label="Impressions · trend"
            points={series(liMonths, (r) => r.li_impressions)}
            height={44}
          />
        </div>
      </Section>

      {/* 2. What am I producing — and against what target. */}
      <Section title="What I'm producing">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2">
            <OutputByMonth months={months} />
          </div>
          <FlagMixBar mix={mix} />
          <WrittenVsDatedBar written={written} />
        </div>
      </Section>

      {/* 3. The cadence floors, unchanged in meaning: `covered` = a slot exists, the
          same test the Thursday Beat reads off `cadence_status`. */}
      <CadenceStrip cadence={cadence} />

      {/* 4. The week, beside what is missing ahead. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_22rem]">
        <Section title="Next 7 days" count={agenda.length}>
          <HomeAgenda
            rows={agenda}
            today={today}
            engagements={engagements}
            metrics={metrics}
            themes={themes}
          />
        </Section>
        <Section title="Missing ahead">
          <CadenceGaps linkedin={liHoles} blog={blogHoles} />
        </Section>
      </div>

      {/* 5. To judge — equal-height cards with room to read them, each opening its
          own drawer. The Calendar's lane answers "when"; this answers "whether". */}
      <Section title="To judge" count={proposalsCount}>
        {proposalsCount === 0 ? (
          <EmptyState>No proposals waiting — the pool is quiet.</EmptyState>
        ) : (
          <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {proposedPieces.map((p) => (
              <EqualHeight key={p.id}>
                <PieceDetail piece={p} metrics={metrics[p.id]} themes={themes} />
              </EqualHeight>
            ))}
            {proposedTalks.map((t) => (
              <EqualHeight key={t.id}>
                <TalkDetail talk={t} />
              </EqualHeight>
            ))}
          </div>
        )}
      </Section>
    </View>
  );
}
