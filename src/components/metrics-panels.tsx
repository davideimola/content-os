import { IdeaRow, PieceRow } from "@/components/metrics-rows";
import { ChannelBadge, EmptyState, StateBadge } from "@/components/pipeline";
import { TrendChart } from "@/components/trend-chart";
import { type MetricsCoverage, monthLabel } from "@/lib/derive";
import type {
  IdeaWithProvenance,
  MonthlyMetrics,
  PieceMetrics,
  PieceWithBlocker,
  ThemeContext,
} from "@/lib/pipeline";
import { cn, formatObservedOn } from "@/lib/utils";

// The Metrics page's panels (#120). Every one of them **reports** a number of record,
// unranked, or states a fact about completeness — never a recommendation about what to
// write (ADR-0021). "This Theme has more Ideas in than Pieces out" is arithmetic;
// "so write more of it" is the Desk's, and does not appear here.
//
// The panels take plain data and hold the wording. Data preparation stays in the view
// (`src/app/metrics/page.tsx`), which is where the one metrics read happens — the same
// split `production.tsx` uses for the home.

const numFmt = new Intl.NumberFormat("en-GB");
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const asDate = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00`);
const cell = (n: number | null | undefined) => (n != null ? numFmt.format(n) : "—");
const growth = (n: number | null) => (n != null ? `+${numFmt.format(n)}` : "—");
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ── the coverage strip ────────────────────────────────────────────────────────
// How much of the output is actually measured — counted **over Pieces**, never over
// Ideas, which is the metre Cadence and the Flag mix are read in. It doubles as the
// explanation for every empty
// cell further down the page, which is why it sits above them and not at the bottom:
// today all three figures collapse to zero coverage, and a page that showed dashes
// without this strip would be a puzzle.
export function CoverageStrip({
  coverage,
  ingestedMonths,
  linkedMonths,
}: {
  coverage: MetricsCoverage;
  /** YYYY-MM keys with per-post rows. */
  ingestedMonths: string[];
  /** The publish months of the Pieces that carry a post URL. */
  linkedMonths: string[];
}) {
  const items = [
    {
      label: plural(coverage.measuredPosts, "measured post", "measured posts"),
      value: coverage.measuredPosts,
    },
    {
      label: `${plural(coverage.linkedPieces, "Piece", "Pieces")} linked to a post`,
      value: coverage.linkedPieces,
    },
    {
      label: "of those, with numbers",
      value: coverage.withNumbers,
      warn: coverage.linkedPieces > 0 && coverage.withNumbers === 0,
    },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {items.map((item) => (
          <span key={item.label} className="text-muted-foreground text-xs">
            <span
              className={cn(
                "text-base font-semibold tabular-nums",
                item.warn ? "text-amber-700 dark:text-amber-400" : "text-foreground"
              )}
            >
              {item.value}
            </span>{" "}
            {item.label}
          </span>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {coverageNote(coverage, ingestedMonths, linkedMonths)}
      </p>
    </div>
  );
}

// The one sentence that explains every absent number below, stated in terms of the
// two things that can be missing: a link, or an ingest.
function coverageNote(
  coverage: MetricsCoverage,
  ingestedMonths: string[],
  linkedMonths: string[]
): string {
  const months = (keys: string[]) => keys.map(monthLabel).join(", ");
  const tail =
    "Below, a per-Piece cell is empty for one of two reasons: no post is linked, or the post's month has not been ingested.";

  if (coverage.measuredPosts === 0)
    return `No LinkedIn month has been ingested yet, so no Piece can carry numbers. ${tail}`;
  if (coverage.linkedPieces === 0)
    return `No Piece carries a post URL yet, so nothing joins the ${coverage.measuredPosts} measured ${plural(coverage.measuredPosts, "post", "posts")} to the output. ${tail}`;
  if (coverage.withNumbers === 0)
    return `Nothing lines up yet: the ingested ${plural(ingestedMonths.length, "month is", "months are")} ${months(ingestedMonths)}, and the linked ${plural(coverage.linkedPieces, "Piece published", "Pieces published")} in ${months(linkedMonths) || "another month"}. ${tail}`;
  return `Ingested: ${months(ingestedMonths)}. ${tail}`;
}

// ── per Piece ─────────────────────────────────────────────────────────────────
// The numbers where they exist and the reason where they do not. The set is every
// Piece that COULD carry numbers — shipped, or carrying a post link — because a
// proposal with no date has no performance question to answer.

// What every Piece row here needs to open its drawer. `PieceRowData` adds the Themes
// only for the panel that shows them, so no caller computes a field its panel drops.
export type PieceLine = {
  piece: PieceWithBlocker;
  metrics?: PieceMetrics;
};

export type PieceRowData = PieceLine & { themeLabels: string[] };

export function PiecePerformance({
  rows,
  themes,
  ingestedMonths,
}: {
  rows: PieceRowData[];
  themes: ThemeContext;
  ingestedMonths: string[];
}) {
  if (rows.length === 0) return <EmptyState>Nothing shipped or linked to a post yet.</EmptyState>;
  const ingested = new Set(ingestedMonths);

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {rows.map(({ piece, metrics, themeLabels }) => (
        <PieceRow key={piece.id} piece={piece} metrics={metrics} themes={themes}>
          <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm">{piece.title}</span>
              <span className="text-muted-foreground truncate text-[0.7rem]">
                {themeLabels.join(" · ") || "no Theme"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <ChannelBadge channel={piece.channel} />
              <StateBadge state={piece.state} />
            </span>
            {/* Wide enough for the longest reason ("linked · September 2026 not
                ingested") to sit on one line where there is room for it. */}
            <span className="shrink-0 sm:w-56 sm:text-right">
              <PieceNumbers piece={piece} metrics={metrics} ingested={ingested} />
            </span>
          </span>
        </PieceRow>
      ))}
    </div>
  );
}

// Numbers, or the reason there are none — never a bare dash. A blog Piece has no
// per-post figure to be missing: the site numbers are site-wide by nature (ADR-0019),
// so its month's visitors are the honest number and the panel says which it is.
function PieceNumbers({
  piece,
  metrics,
  ingested,
}: {
  piece: PieceWithBlocker;
  metrics?: PieceMetrics;
  ingested: Set<string>;
}) {
  if (metrics?.linkedin)
    return (
      <span className="flex flex-wrap items-baseline gap-x-2 text-xs sm:justify-end">
        <span className="text-sm font-semibold tabular-nums">
          {numFmt.format(metrics.linkedin.impressions)}
        </span>
        <span className="text-muted-foreground">impressions</span>
        <span className="font-semibold tabular-nums">
          {numFmt.format(metrics.linkedin.engagements)}
        </span>
        <span className="text-muted-foreground">
          engagements{metrics.linkedin.months > 1 ? ` · ${metrics.linkedin.months} months` : ""}
        </span>
      </span>
    );

  if (piece.channel === "blog")
    return (
      <span className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-xs sm:justify-end">
        {metrics?.siteVisitors != null ? (
          <>
            <span className="text-foreground text-sm font-semibold tabular-nums">
              {numFmt.format(metrics.siteVisitors)}
            </span>
            <span>visitors that month — site-wide, not this page</span>
          </>
        ) : (
          <span>blog — the site figures are site-wide and that month has none</span>
        )}
      </span>
    );

  const month = piece.publish_date?.slice(0, 7);
  const reason = !piece.linkedin_post_url
    ? "no post linked"
    : month && !ingested.has(month)
      ? `linked · ${monthLabel(month)} not ingested`
      : "linked · not in the ingested export";

  return <span className="text-muted-foreground text-xs">{reason}</span>;
}

// ── the measured posts ────────────────────────────────────────────────────────
export type MeasuredPost = {
  url: string;
  impressions: number;
  engagements: number;
  months: number;
  /** The Piece pointing at it, when one does. */
  pieceTitle: string | null;
};

// A measured post's slug, which is the only human-readable part of a LinkedIn URL.
const slug = (url: string) =>
  decodeURIComponent(url.split("/").filter(Boolean).pop() ?? url).replace(
    /-(share|ugcPost)-.*$/,
    ""
  );

export function MeasuredPosts({
  posts,
  hidden,
  unlinked,
  total,
}: {
  posts: MeasuredPost[];
  hidden: number;
  unlinked: number;
  total: number;
}) {
  if (total === 0) return <EmptyState>No month ingested — /review imports one.</EmptyState>;

  return (
    <div className="flex flex-col gap-2">
      {/* Deliberately not worded as a queue to empty: most measured posts are not
          editorial output at all, so per-Piece coverage is partial by nature and that
          is correct. */}
      <p className="text-muted-foreground text-xs">
        {unlinked} of {total} measured {plural(total, "post is", "posts are")} not linked to a
        Piece. That is expected rather than a backlog — much of what LinkedIn measures is not
        editorial output at all (announcements, team photos, event reshares). A link is what joins a
        post's numbers to a Piece, where there is a Piece.
      </p>
      <div className="flex flex-col divide-y rounded-lg border">
        {posts.map((post) => (
          <div key={post.url} className="flex items-center gap-3 px-3 py-2">
            <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
              {numFmt.format(post.impressions)}
            </span>
            <span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
              {numFmt.format(post.engagements)} eng
            </span>
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground min-w-0 flex-1 truncate text-xs underline underline-offset-2"
              title={post.url}
            >
              {post.pieceTitle ?? slug(post.url)}
            </a>
            {post.pieceTitle ? null : (
              <span className="shrink-0 rounded-md border border-dashed border-amber-500/40 px-1.5 text-[0.65rem] text-amber-700 dark:text-amber-400">
                unlinked
              </span>
            )}
          </div>
        ))}
      </div>
      {hidden > 0 ? (
        <p className="text-muted-foreground text-xs">
          {hidden} more measured {plural(hidden, "post", "posts")} not shown.
        </p>
      ) : null}
    </div>
  );
}

// ── Ideas to output ───────────────────────────────────────────────────────────
// Which sparks became Pieces, and how many times. Volume of record, unranked — no
// spark is called promising here.
export function IdeaYield({
  rows,
  themes,
  hidden,
  liveCount,
  neverUsed,
}: {
  rows: IdeaWithProvenance[];
  themes: ThemeContext;
  hidden: number;
  liveCount: number;
  neverUsed: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        {liveCount} live {plural(liveCount, "Idea", "Ideas")} · {liveCount - neverUsed} became
        output · {neverUsed} not yet used.
      </p>
      {rows.length === 0 ? (
        <EmptyState>No Idea has become output yet.</EmptyState>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {rows.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} themes={themes}>
              <span className="flex min-w-0 flex-1 items-baseline gap-3">
                <span className="w-8 shrink-0 text-sm font-semibold tabular-nums">
                  {idea.usedCount}×
                </span>
                {/* The Themes go UNDER the title on a phone and beside it on a wide row
                    — different density, never a fact the phone lacks (ADR-0021 dec.3),
                    which a `hidden sm:block` would have been. */}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {idea.title?.trim() || idea.body}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[0.7rem]">
                    {idea.themes
                      .filter((t) => !t.archived)
                      .map((t) => t.label)
                      .join(" · ") || "no Theme"}
                  </span>
                </span>
              </span>
            </IdeaRow>
          ))}
        </div>
      )}
      {hidden > 0 ? (
        <p className="text-muted-foreground text-xs">{hidden} more with output not shown.</p>
      ) : null}
    </div>
  );
}

// ── published, with nothing to point at ───────────────────────────────────────
// A completeness fact, not a judgement: a Piece marked published with no artifact URL
// has no address of record. The row opens the drawer where the URL is set.
export function MissingArtifacts({
  rows,
  themes,
  publishedCount,
}: {
  rows: PieceLine[];
  themes: ThemeContext;
  publishedCount: number;
}) {
  if (rows.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-xs">
        All {publishedCount} published {plural(publishedCount, "Piece", "Pieces")} carry an artifact
        URL.
      </p>
    );

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {rows.map(({ piece, metrics }) => (
        <PieceRow key={piece.id} piece={piece} metrics={metrics} themes={themes}>
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{piece.title}</span>
            <ChannelBadge channel={piece.channel} />
            <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">no artifact</span>
          </span>
        </PieceRow>
      ))}
    </div>
  );
}

// ── followers ─────────────────────────────────────────────────────────────────
// The level with the date it was observed, beside cumulative growth from the first
// month with data (#113). The level is not a figure of any month — the export reports
// the total at export time — so it is never a column in the table below.
export function FollowerBlock({
  level,
  growthPoints,
}: {
  level: { observed_on: string; total: number } | null;
  growthPoints: Array<{ month: string; value: number }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex flex-col justify-center gap-2 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {level ? numFmt.format(level.total) : "—"}
          </span>
          <span className="text-muted-foreground text-xs">
            {level
              ? `followers, as observed on ${formatObservedOn(level.observed_on)}`
              : "no follower level observed yet"}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          A total is a snapshot at the moment it was read, not a month's closing figure — so it is
          kept with its observation date, and the per-month story is growth.
          {level ? "" : " The Review records one with the date it was read."}
        </p>
      </div>
      <TrendChart label="Follower growth · cumulative" points={growthPoints} />
    </div>
  );
}

// ── the month table ───────────────────────────────────────────────────────────
// The accessible view of every chart on the page. Followers appear as the month's
// GROWTH, never as a level (#113): growth is the figure the month actually owns.
export function MonthTable({ rows }: { rows: MonthlyMetrics[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium" rowSpan={2}>
              Month
            </th>
            <th className="border-l px-3 py-1.5 text-center font-medium" colSpan={4}>
              LinkedIn
            </th>
            <th className="border-l px-3 py-1.5 text-center font-medium" colSpan={2}>
              Site
            </th>
          </tr>
          <tr className="border-b">
            <th className="border-l px-3 py-1.5 text-right font-medium">Impressions</th>
            <th className="px-3 py-1.5 text-right font-medium">Reach</th>
            <th className="px-3 py-1.5 text-right font-medium">Engag.</th>
            <th className="px-3 py-1.5 text-right font-medium">New followers</th>
            <th className="border-l px-3 py-1.5 text-right font-medium">Visitors</th>
            <th className="px-3 py-1.5 text-right font-medium">Page views</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row) => (
            <tr key={row.month} className="border-b last:border-0">
              <td className="px-3 py-2 text-left whitespace-nowrap">
                {monthFmt.format(asDate(row.month))}
              </td>
              <td className="border-l px-3 py-2 text-right">{cell(row.li_impressions)}</td>
              <td className="px-3 py-2 text-right">{cell(row.li_reach)}</td>
              {/* `—`, not `0`, for a month with no per-post ingest: absence of data is
                  not a measurement of zero (#120). */}
              <td className="px-3 py-2 text-right">{cell(row.li_engagements)}</td>
              <td className="px-3 py-2 text-right">{growth(row.li_new_followers)}</td>
              <td className="border-l px-3 py-2 text-right">{cell(row.site_visitors)}</td>
              <td className="px-3 py-2 text-right">{cell(row.site_page_views)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground px-3 py-2 text-xs">
        An empty cell is a month that was not ingested for that source, never a zero.
      </p>
    </div>
  );
}
