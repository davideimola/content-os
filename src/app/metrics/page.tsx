import { EmptyState, Section } from "@/components/pipeline";
import { TrendChart } from "@/components/trend-chart";
import { View } from "@/components/view";
import { getMonthlyMetrics, type MonthlyMetrics } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

const numFmt = new Intl.NumberFormat("en-GB");
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const asDate = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00`);
const cell = (n: number | null) => (n != null ? numFmt.format(n) : "—");

// A chart wants points oldest -> newest; the rows come newest-first.
function series(rows: MonthlyMetrics[], pick: (r: MonthlyMetrics) => number | null) {
  return [...rows].reverse().map((r) => ({ month: r.month, value: pick(r) }));
}

export default async function MetricsPage() {
  const rows = await getMonthlyMetrics();

  if (rows.length === 0) {
    return (
      <View title="Metrics" subtitle="Month-by-month · LinkedIn + site">
        <EmptyState>No metrics ingested yet — run /review to import a month.</EmptyState>
      </View>
    );
  }

  return (
    <View title="Metrics" subtitle={`Month-by-month · LinkedIn + site · ${rows.length} months`}>
      <Section title="Trends">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <TrendChart label="Followers" points={series(rows, (r) => r.li_followers)} />
          <TrendChart label="Impressions" points={series(rows, (r) => r.li_impressions)} />
          <TrendChart label="Engagements" points={series(rows, (r) => r.li_engagements)} />
          <TrendChart label="Site visitors" points={series(rows, (r) => r.site_visitors)} />
        </div>
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
                <th className="px-3 py-1.5 text-right font-medium">Followers</th>
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
                  <td className="px-3 py-2 text-right">
                    {cell(r.li_followers)}
                    {r.li_new_followers != null ? (
                      <span className="text-muted-foreground ml-1 text-xs">
                        (+{r.li_new_followers})
                      </span>
                    ) : null}
                  </td>
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
