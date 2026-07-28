import { EmptyState, Section } from "@/components/pipeline";
import { TrendChart } from "@/components/trend-chart";
import { View } from "@/components/view";
import {
  cumulativeFollowerGrowth,
  type FollowerLevel,
  getLatestFollowerLevel,
  getMonthlyMetrics,
  type MonthlyMetrics,
} from "@/lib/pipeline";
import { formatObservedOn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const numFmt = new Intl.NumberFormat("en-GB");
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const asDate = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00`);
const cell = (n: number | null) => (n != null ? numFmt.format(n) : "—");
const growth = (n: number | null) => (n != null ? `+${cell(n)}` : cell(n));

// A chart wants points oldest -> newest; the rows come newest-first.
function series(rows: MonthlyMetrics[], pick: (r: MonthlyMetrics) => number | null) {
  return [...rows].reverse().map((r) => ({ month: r.month, value: pick(r) }));
}

// The follower level is not a figure of any month (#113), so it is stated on its
// own line — including when no month has been ingested at all, which is exactly
// when a level on record must not disappear with the table that never had it.
function FollowerLevelLine({ level }: { level: FollowerLevel | null }) {
  return (
    <p className="text-muted-foreground text-xs">
      {level
        ? `Follower level: ${numFmt.format(level.total)} as observed on ${formatObservedOn(level.observed_on)}.`
        : "No follower level observed yet — the Review records one with the date it was read."}
    </p>
  );
}

export default async function MetricsPage() {
  const [rows, followerLevel] = await Promise.all([getMonthlyMetrics(), getLatestFollowerLevel()]);

  if (rows.length === 0) {
    return (
      <View title="Metrics" subtitle="Month-by-month · LinkedIn + site">
        <EmptyState>No metrics ingested yet — run /review to import a month.</EmptyState>
        <FollowerLevelLine level={followerLevel} />
      </View>
    );
  }

  return (
    <View title="Metrics" subtitle={`Month-by-month · LinkedIn + site · ${rows.length} months`}>
      <Section title="Trends">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* The follower curve is cumulative GROWTH from the first month with data —
              each step is that month's exact new_followers, so the slope is true even
              with a single point. The absolute LEVEL is a separate fact, carrying the
              date it was observed (#113). */}
          <TrendChart label="Follower growth" points={cumulativeFollowerGrowth(rows)} />
          <TrendChart label="Impressions" points={series(rows, (r) => r.li_impressions)} />
          <TrendChart label="Engagements" points={series(rows, (r) => r.li_engagements)} />
          <TrendChart label="Site visitors" points={series(rows, (r) => r.site_visitors)} />
        </div>
        <p className="text-muted-foreground text-xs">
          Follower growth is cumulative from the first month with data.
        </p>
        <FollowerLevelLine level={followerLevel} />
      </Section>

      <Section title="By month">
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
                {/* Growth, not a level: the month's own exact figure. A level read after
                    the month ended was never this row's to carry (#113). */}
                <th className="px-3 py-1.5 text-right font-medium">New followers</th>
                <th className="border-l px-3 py-1.5 text-right font-medium">Visitors</th>
                <th className="px-3 py-1.5 text-right font-medium">Page views</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.month} className="border-b last:border-0">
                  <td className="px-3 py-2 text-left whitespace-nowrap">
                    {monthFmt.format(asDate(r.month))}
                  </td>
                  <td className="border-l px-3 py-2 text-right">{cell(r.li_impressions)}</td>
                  <td className="px-3 py-2 text-right">{cell(r.li_reach)}</td>
                  <td className="px-3 py-2 text-right">{cell(r.li_engagements)}</td>
                  <td className="px-3 py-2 text-right">{growth(r.li_new_followers)}</td>
                  <td className="border-l px-3 py-2 text-right">{cell(r.site_visitors)}</td>
                  <td className="px-3 py-2 text-right">{cell(r.site_page_views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </View>
  );
}
