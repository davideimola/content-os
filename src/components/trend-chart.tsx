import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// A compact single-series trend (change-over-time → area+line). Mono-hue, so no
// categorical CVD concern; theme-aware via the accent class + currentColor. Pure
// SVG, no charting dependency. The full numbers live in the /metrics table (the
// accessible "table view"); this is the glance. Degrades to the latest number
// when there are fewer than two months to plot.
type Point = { month: string; value: number | null };

const numFmt = new Intl.NumberFormat("en-GB");
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });
const shortMonth = (m: string) => monthFmt.format(new Date(`${m.slice(0, 7)}-01T00:00:00`));

export function TrendChart({
  label,
  points,
  accentClassName = "text-sky-600 dark:text-sky-400",
  format = (n) => numFmt.format(n),
  height = 56,
}: {
  label: string;
  points: Point[]; // oldest -> newest
  accentClassName?: string;
  format?: (n: number) => string;
  height?: number;
}) {
  const defined = points.filter((p): p is { month: string; value: number } => p.value != null);
  const latest = defined.at(-1)?.value ?? null;

  return (
    <Card className="gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-lg font-semibold tabular-nums tracking-tight">
          {latest != null ? format(latest) : "—"}
        </span>
      </div>
      {defined.length >= 2 ? (
        <>
          <Sparkline points={defined} accentClassName={accentClassName} height={height} />
          <div className="text-muted-foreground flex justify-between text-[0.65rem] tabular-nums">
            <span>{shortMonth(defined[0].month)}</span>
            <span>{shortMonth(defined[defined.length - 1].month)}</span>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground/70 flex items-center text-[0.7rem]" style={{ height }}>
          Trend builds as you ingest more months.
        </p>
      )}
    </Card>
  );
}

function Sparkline({
  points,
  accentClassName,
  height,
}: {
  points: { month: string; value: number }[];
  accentClassName: string;
  height: number;
}) {
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const n = points.length;
  const PAD = 8; // keep the line off the top/bottom edges (viewBox units)
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => PAD + (1 - (v - min) / span) * (100 - 2 * PAD);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`)
    .join(" ");
  const area = `${line} L100,100 L0,100 Z`;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative; the numbers live in the header + the /metrics table
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("w-full", accentClassName)}
      style={{ height }}
      aria-hidden
    >
      <path d={area} fill="currentColor" fillOpacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
