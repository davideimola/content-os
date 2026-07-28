import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// A compact single-series trend (change-over-time → area+line). Mono-hue, so no
// categorical CVD concern; theme-aware via the accent class + currentColor. Pure
// SVG, no charting dependency. The full numbers live in the /metrics table (the
// accessible "table view"); this is the glance.
//
// It plots whatever it is given, including a SINGLE point — one month of data is
// one honest point, not an empty chart (#113: the follower curve starts with one).
// It falls back to text only when there is nothing defined to plot at all.
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
      {defined.length >= 1 ? (
        <>
          <Sparkline points={defined} accentClassName={accentClassName} height={height} />
          <div className="text-muted-foreground flex justify-between text-[0.65rem] tabular-nums">
            <span>{shortMonth(defined[0].month)}</span>
            {defined.length > 1 ? (
              <span>{shortMonth(defined[defined.length - 1].month)}</span>
            ) : null}
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
  // One point has no horizontal extent and no range: place it mid-card and draw it
  // as a dot (a round-capped zero-length stroke — the viewBox is non-uniformly
  // scaled, so a <circle> would come out an ellipse). No area under one point:
  // there is no interval for it to cover.
  const single = n === 1;
  const x = (i: number) => (single ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => (single ? 50 : PAD + (1 - (v - min) / span) * (100 - 2 * PAD));
  const line = single
    ? "M50,50 L50,50"
    : points
        .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`)
        .join(" ");
  const area = single ? null : `${line} L100,100 L0,100 Z`;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative; the numbers live in the header + the /metrics table
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("w-full", accentClassName)}
      style={{ height }}
      aria-hidden
    >
      {area ? <path d={area} fill="currentColor" fillOpacity={0.12} /> : null}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={single ? 6 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
