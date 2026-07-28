import {
  CoverageStrip,
  FollowerBlock,
  IdeaYield,
  type MeasuredPost,
  MeasuredPosts,
  MissingArtifacts,
  MonthTable,
  PiecePerformance,
  type PieceRowData,
} from "@/components/metrics-panels";
import { EmptyState, Section } from "@/components/pipeline";
import { ThemeMap, ThemeScoreboard } from "@/components/theme-map";
import { TrendChart } from "@/components/trend-chart";
import { MetricTile, View } from "@/components/view";
import { capped, metricsCoverage, monthLabel, themeDegree, themeGraph } from "@/lib/derive";
import {
  cumulativeFollowerGrowth,
  getIdeasWithProvenance,
  getMetricsContext,
  getPieces,
  getThemeContext,
  type MonthlyMetrics,
  sumByPostUrl,
} from "@/lib/pipeline";
import { formatObservedOn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Metrics is the "how is it going" view, and it reads like one: the month's numbers
// first, then what is measured and what is not, then the shape of the positioning over
// the output, then the numbers per Piece, per post and per Idea, then the follower
// block and the month table (#120).
//
// It **reports** numbers of record, unranked, and computes facts about completeness —
// which is what ADR-0021 allows the console to do. It never concludes from them: there
// is no suggestions block, nothing is ranked as promising, and "where to push next" is
// the Desk's question, asked with `editorial-signals.md` in hand.
//
// One read (`getMetricsContext`) covers the month rows, the per-post list, the
// per-Piece cross and which months were ingested at all, because four panels here need
// the same three tables.

const numFmt = new Intl.NumberFormat("en-GB");
const monthShortFmt = new Intl.DateTimeFormat("en-GB", { month: "short" });
const asMonth = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00`);
const cell = (n: number | null | undefined) => (n != null ? numFmt.format(n) : "—");

// A chart wants points oldest -> newest; the monthly rows come newest-first.
function series(rows: MonthlyMetrics[], pick: (r: MonthlyMetrics) => number | null) {
  return [...rows].reverse().map((r) => ({ month: r.month, value: pick(r) }));
}

// Display caps. A metrics page is a read, not a work queue, so a long list states what
// it left out rather than paginating.
const POSTS_SHOWN = 8;
const IDEAS_SHOWN = 8;

export default async function MetricsPage() {
  const pieces = await getPieces();
  const [metrics, ideas, themes] = await Promise.all([
    getMetricsContext(pieces),
    getIdeasWithProvenance(),
    getThemeContext(),
  ]);

  const monthly = metrics.monthly;

  // The headline tracks the latest month with LinkedIn data of any kind — a site-only
  // month (a provisional figure parked ahead of the LinkedIn ingest) must not blank the
  // section, and a month with per-post rows but no account snapshot still counts.
  const liMonths = monthly.filter(
    (m) => m.li_impressions != null || m.li_new_followers != null || m.li_engagements != null
  );
  const latest = liMonths[0];
  const siteMonths = monthly.filter((m) => m.site_visitors != null || m.site_page_views != null);
  const latestSite = siteMonths[0];

  // ── what is measured, and what that explains ───────────────────────────────
  const coverage = metricsCoverage(pieces, metrics.posts);
  const linkedMonths = [
    ...new Set(
      pieces
        .filter((p) => p.linkedin_post_url && p.publish_date)
        .map((p) => (p.publish_date as string).slice(0, 7))
    ),
  ].sort();

  // ── themes on the output ───────────────────────────────────────────────────
  const graph = themeGraph(ideas, pieces, themes.byPiece);
  const degree = themeDegree(graph);
  const themeAssignments = ideas
    .filter((i) => i.status === "live")
    .reduce((n, i) => n + i.themes.length, 0);

  // ── per Piece: everything that could carry numbers ─────────────────────────
  // Shipped, or carrying a post link. Sorted by impressions, with a date and an id
  // behind it so the order is total and the page renders the same way twice.
  const impressionsOf = (id: string) => metrics.byPiece[id]?.linkedin?.impressions ?? -1;
  const piecePerformance: PieceRowData[] = pieces
    .filter((p) => p.state === "published" || p.linkedin_post_url)
    .sort(
      (a, b) =>
        impressionsOf(b.id) - impressionsOf(a.id) ||
        (b.publish_date ?? "").localeCompare(a.publish_date ?? "") ||
        a.id.localeCompare(b.id)
    )
    .map((piece) => ({
      piece,
      metrics: metrics.byPiece[piece.id],
      themeLabels: (themes.byPiece[piece.id] ?? []).map((t) => t.label),
    }));

  // ── the measured posts, with the unlinked ones flagged ─────────────────────
  const titleByUrl = new Map(
    pieces.filter((p) => p.linkedin_post_url).map((p) => [p.linkedin_post_url as string, p.title])
  );
  const measured: MeasuredPost[] = [...sumByPostUrl(metrics.posts).entries()]
    .map(([url, sum]) => ({ url, ...sum, pieceTitle: titleByUrl.get(url) ?? null }))
    .sort((a, b) => b.impressions - a.impressions || a.url.localeCompare(b.url));
  const measuredShown = capped(measured, POSTS_SHOWN);

  // ── Ideas to output ────────────────────────────────────────────────────────
  const liveIdeas = ideas.filter((i) => i.status === "live");
  const productive = capped(
    liveIdeas
      .filter((i) => i.usedCount > 0)
      .sort((a, b) => b.usedCount - a.usedCount || b.created_at.localeCompare(a.created_at)),
    IDEAS_SHOWN
  );

  // ── completeness: published with nothing to point at ───────────────────────
  const published = pieces.filter((p) => p.state === "published");
  const missingArtifacts: PieceRowData[] = published
    .filter((p) => !p.artifact_url)
    .map((piece) => ({
      piece,
      metrics: metrics.byPiece[piece.id],
      themeLabels: (themes.byPiece[piece.id] ?? []).map((t) => t.label),
    }));

  return (
    <View
      title="Metrics"
      subtitle={`${monthly.length} months · ${graph.nodes.length} Themes · LinkedIn + site`}
      wide
    >
      {/* 1. The month's numbers, not a table. */}
      <Section
        title={
          latest
            ? `This month on LinkedIn · ${monthLabel(latest.month.slice(0, 7))}`
            : "This month on LinkedIn · no month ingested yet"
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <MetricTile label="Impressions" value={cell(latest?.li_impressions)} />
          <MetricTile label="Members reached" value={cell(latest?.li_reach)} />
          {/* `—` where the month has no per-post rows: absence of an ingest is not a
              measurement of zero (#120). */}
          <MetricTile label="Engagements" value={cell(latest?.li_engagements)} />
          {/* The LEVEL carries the date it was observed, never a month's key (#113);
              the month's growth sits beside it, named by its month. */}
          <MetricTile
            label={
              metrics.followerLevel
                ? `Followers · ${formatObservedOn(metrics.followerLevel.observed_on)}`
                : "Followers · never observed"
            }
            value={metrics.followerLevel ? numFmt.format(metrics.followerLevel.total) : "—"}
            delta={
              latest?.li_new_followers != null
                ? `+${numFmt.format(latest.li_new_followers)} in ${monthShortFmt.format(asMonth(latest.month))}`
                : undefined
            }
            tone={latest?.li_new_followers && latest.li_new_followers > 0 ? "up" : "neutral"}
          />
          <TrendChart
            label="Impressions · trend"
            points={series(liMonths, (r) => r.li_impressions)}
            height={44}
          />
          <TrendChart
            label="Engagements · trend"
            points={series(liMonths, (r) => r.li_engagements)}
            height={44}
          />
        </div>
      </Section>

      {/* 2. What is measured — and the explanation for every empty cell below. */}
      <Section title="What is measured">
        <CoverageStrip
          coverage={coverage}
          ingestedMonths={metrics.ingestedMonths}
          linkedMonths={linkedMonths}
        />
      </Section>

      {/* 3. The shape of the positioning, beside the numbers behind it. */}
      <Section title="Themes on the output" count={graph.nodes.length}>
        {graph.nodes.length === 0 ? (
          <EmptyState>No Theme is carried by an Idea or an output yet.</EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-1 items-center gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ThemeMap graph={graph} />
              <ThemeScoreboard graph={graph} degree={degree} />
            </div>
            <p className="text-muted-foreground text-xs">
              {themeAssignments} Theme assignments across {liveIdeas.length} live Ideas ·{" "}
              {graph.edges.length} pairs share an output.
            </p>
          </>
        )}
      </Section>

      {/* 4. Per Piece — numbers, or the reason there are none. */}
      <Section title="Per Piece" count={piecePerformance.length}>
        <PiecePerformance
          rows={piecePerformance}
          themes={themes}
          ingestedMonths={metrics.ingestedMonths}
        />
      </Section>

      {/* 5. The posts LinkedIn actually measured. */}
      <Section title="LinkedIn posts measured" count={coverage.measuredPosts}>
        <MeasuredPosts
          posts={measuredShown.shown}
          hidden={measuredShown.hidden}
          unlinked={coverage.unlinkedPosts}
          total={coverage.measuredPosts}
        />
      </Section>

      {/* 6. Which sparks became output, and how many times. */}
      <Section title="Ideas that became output">
        <IdeaYield
          rows={productive.shown}
          hidden={productive.hidden}
          themes={themes}
          liveCount={liveIdeas.length}
          neverUsed={liveIdeas.filter((i) => i.usedCount === 0).length}
        />
      </Section>

      {/* A completeness fact, in the view where the record is being read. */}
      <Section title="Published with no artifact URL">
        <MissingArtifacts
          rows={missingArtifacts}
          themes={themes}
          publishedCount={published.length}
        />
      </Section>

      {/* 7. The follower block and the month table. */}
      <Section title="Followers">
        <FollowerBlock
          level={metrics.followerLevel}
          growthPoints={cumulativeFollowerGrowth(monthly)}
        />
      </Section>

      {latestSite ? (
        <Section title={`Site · ${monthLabel(latestSite.month.slice(0, 7))}`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricTile label="Visitors" value={cell(latestSite.site_visitors)} />
            <MetricTile label="Page views" value={cell(latestSite.site_page_views)} />
            <div className="md:col-span-2">
              <TrendChart
                label="Site visitors · trend"
                points={series(siteMonths, (r) => r.site_visitors)}
              />
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="By month" count={monthly.length}>
        {monthly.length === 0 ? (
          <EmptyState>No metrics ingested yet — run /review to import a month.</EmptyState>
        ) : (
          <MonthTable rows={monthly} />
        )}
      </Section>
    </View>
  );
}
