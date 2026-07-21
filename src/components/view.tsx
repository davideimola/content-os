import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// A compact KPI tile for the Overview. `href` makes the whole tile a link; `accent`
// draws attention (e.g. proposals waiting to be judged).
export function StatTile({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number | string;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <Card
      className={cn(
        "gap-1 p-4 transition-colors",
        href && "hover:border-foreground/20",
        accent && "border-amber-500/40 bg-amber-500/10"
      )}
    >
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// Shared view container: a centered, width-capped column with a title row.
export function View({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}
