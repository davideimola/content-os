import { Card } from "@/components/ui/card";
import { type MonthHole, TUNING, type WeekHole } from "@/lib/derive";

// "What is missing ahead" — the two cadence floors read forward. The Calendar lists
// what exists; nothing anywhere said what is absent, and the Thursday Beat only ever
// looks at the current week.
//
// The holes are the Beat's own definition of `covered` projected forward (see
// `linkedinHolesAhead` / `blogHolesAhead`), so this card can never disagree with the
// pills beside it: the pills answer the CURRENT period, this answers the ones after
// it. Facts about time, no suggestion about what to put in the hole (ADR-0021).
function GapGroup({ label, items }: { label: string; items: { key: string; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[0.65rem] tracking-wide uppercase">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((i) => (
          <span
            key={i.key}
            className="rounded-md border border-amber-500/40 bg-amber-500/5 px-1.5 py-0.5 text-[0.7rem] tabular-nums text-amber-700 dark:text-amber-400"
          >
            {i.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CadenceGaps({ linkedin, blog }: { linkedin: WeekHole[]; blog: MonthHole[] }) {
  const total = linkedin.length + blog.length;
  return (
    <Card className="h-fit gap-3 p-4">
      {/* The section heading above already says "Missing ahead" — this row names what
          the number counts instead of repeating it. */}
      <div className="flex items-baseline justify-between gap-2">
        {/* "open" is the pills' own word for an uncovered period — one vocabulary for
            one fact, and the card never re-words what the Beat's view already says. */}
        <span className="text-muted-foreground text-xs">
          {total === 1 ? "open period" : "open periods"}
        </span>
        <span className="text-lg font-semibold tabular-nums tracking-tight">{total}</span>
      </div>
      {total === 0 ? (
        // Careful wording: the current week and month are excluded, so this must not
        // claim they are covered — a pill beside it may well read `open`.
        <p className="text-muted-foreground text-xs">
          Nothing open in the {TUNING.linkedinHoleWeeks} weeks and {TUNING.blogHoleMonths} months
          after the current one.
        </p>
      ) : null}
      <GapGroup
        label={`no LinkedIn · next ${TUNING.linkedinHoleWeeks} weeks`}
        items={linkedin.map((w) => ({ key: w.key, text: w.label }))}
      />
      <GapGroup
        label={`no blog · next ${TUNING.blogHoleMonths} months`}
        items={blog.map((m) => ({ key: m.key, text: m.label }))}
      />
      {total > 0 ? (
        <p className="text-muted-foreground text-[0.65rem]">
          A hole is a period with no Piece holding a slot — the same test the cadence pills apply to
          this week.
        </p>
      ) : null}
    </Card>
  );
}
