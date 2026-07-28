import { Ban, Check, CircleCheck, CircleDashed, Clock, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Readiness, ReadinessKey } from "@/lib/derive";
import { cn } from "@/lib/utils";

// Readiness as one mark, everywhere it shows: whether the thing on the date is
// actually written (`src/lib/derive.ts`). It sits **beside** the state badge and
// never replaces it — "slotted" is the record, "not written" is the arithmetic over
// it, and the whole point of the rework is that those are two different facts.
//
// Status colour is never the only cue: every mark carries its icon and its words,
// so it survives a colourblind reader, a screenshot and a grayscale print.
const READINESS_STYLE: Record<
  ReadinessKey,
  { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; className: string }
> = {
  shipped: {
    icon: Check,
    className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  },
  in_can: {
    icon: CircleCheck,
    className: "border-teal-500/40 text-teal-700 dark:text-teal-400",
  },
  not_written: {
    icon: CircleDashed,
    className: "text-muted-foreground",
  },
  late: {
    icon: Clock,
    className: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  missed: {
    icon: TriangleAlert,
    className: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  declined: {
    icon: Ban,
    className: "text-muted-foreground",
  },
};

// "in 3d" / "3d ago" — shown only where the work is not done, because that is the
// only case where the distance to the date is something to act on.
function daysCue(readiness: Readiness): string | null {
  const { key, daysUntil } = readiness;
  if (key === "shipped" || key === "declined") return null;
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d ago`;
  if (daysUntil === 0) return "today";
  if (key === "in_can") return null;
  return `in ${daysUntil}d`;
}

export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  const { icon: Icon, className } = READINESS_STYLE[readiness.key];
  const cue = daysCue(readiness);
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", className)}>
      <Icon aria-hidden />
      {readiness.label}
      {cue ? <span className="opacity-80 tabular-nums">· {cue}</span> : null}
    </Badge>
  );
}
