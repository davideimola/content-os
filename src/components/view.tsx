import { ArrowDown, ArrowUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// A KPI tile with an optional month-over-month delta. `tone` colours the delta:
// up = growth (emerald), down = decline (red), neutral = muted. The caller writes
// the delta text (e.g. "8% vs May" or "+46 this month").
export function MetricTile({
  label,
  value,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  delta?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const Arrow = tone === "up" ? ArrowUp : tone === "down" ? ArrowDown : null;
  return (
    // Centred, so a tile sharing a grid row with something taller (a trend chart on
    // the Overview) reads as a deliberate KPI rather than as content that fell to
    // the top of an over-tall box.
    <Card className="justify-center gap-1 p-4">
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
      {delta ? (
        <span
          className={cn(
            "mt-0.5 flex items-center gap-1 text-xs tabular-nums",
            tone === "up" && "text-emerald-600 dark:text-emerald-400",
            tone === "down" && "text-red-600 dark:text-red-400",
            tone === "neutral" && "text-muted-foreground"
          )}
        >
          {Arrow ? <Arrow aria-hidden className="size-3" /> : null}
          {delta}
        </span>
      ) : null}
    </Card>
  );
}

// Shared view container: a centered, width-capped column with a title row.
// `wide` opens the cap for a view whose content is tiles, bars and lanes rather than
// prose — a desktop screen should not be three quarters empty (#116). The responsive
// rule is unchanged either way: same view, same question, different density.
export function View({
  title,
  subtitle,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-4 py-6 lg:py-8",
        wide ? "max-w-[96rem]" : "max-w-6xl"
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}
